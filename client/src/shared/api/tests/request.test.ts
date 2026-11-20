import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError, request, RequestTimeoutError, ResponseFormatError } from "../request";
import { retryRead } from "../query-client";

type FetchImplementation = (path: string, init: RequestInit) => Response | Promise<Response>;

/** Replaces the global fetch with a mock and returns it, so a test can check how fetch was called. */
function stubFetch(implementation: FetchImplementation) {
  // The implementation runs on every call, so each call gets a new Response. A response body can be read only once.
  const fetch = vi.fn(async (path: string, init: RequestInit) => implementation(path, init));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

/** Acts like a stalled network: it never answers, and it fails only when the request is cancelled. */
function stalledResponse(_path: string, { signal }: RequestInit) {
  // request() always sends a signal, so a missing one is a bug in request() and should fail loudly here.
  if (!signal) throw new Error("request() sent no AbortSignal.");

  return new Promise<Response>((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("HTTP response boundary", () => {
  it("validates JSON and preserves Headers instances while adding Accept and cookies", async () => {
    const fetch = stubFetch(() => Response.json({ stock: 12 }));

    await expect(
      request("/api/example", z.object({ stock: z.number().int() }), {
        headers: new Headers({ "x-csrf-token": "token" }),
      }),
    ).resolves.toEqual({ stock: 12 });

    const [, init] = fetch.mock.calls[0];
    expect(init.credentials).toBe("include");
    expect(new Headers(init.headers).get("Accept")).toBe("application/json");
    expect(new Headers(init.headers).get("x-csrf-token")).toBe("token");
  });

  it("preserves a controlled API conflict separately from schema failures", async () => {
    stubFetch(() =>
      Response.json({ error: { message: "The cart changed concurrently.", code: "cart.conflict" } }, { status: 409 }),
    );

    await expect(request("/api/example", z.unknown())).rejects.toMatchObject({ status: 409, code: "cart.conflict" });
  });

  it("preserves HTTP status when a proxy returns HTML instead of an error envelope", async () => {
    stubFetch(() => new Response("<h1>Unavailable</h1>", { status: 503 }));

    await expect(request("/api/example", z.unknown())).rejects.toMatchObject({
      status: 503,
      message: "Request failed.",
    });
  });

  it("accepts the explicit 204 contract and rejects 204 for a JSON endpoint", async () => {
    stubFetch(() => new Response(null, { status: 204 }));

    await expect(
      request("/api/auth/logout", z.undefined(), { method: "POST" }, { response: "empty" }),
    ).resolves.toBeUndefined();
    await expect(request("/api/example", z.object({ stock: z.number() }))).rejects.toBeInstanceOf(ResponseFormatError);
  });

  it("rejects malformed JSON and invalid response fields without exposing the received values", async () => {
    const malformedJson = () => new Response("{", { headers: { "content-type": "application/json" } });
    const wrongFieldType = () => Response.json({ stock: "private-example-value" });

    for (const response of [malformedJson, wrongFieldType]) {
      stubFetch(response);
      // toEqual compares the whole error, so the test fails if the message ever includes the received value.
      await expect(request("/api/example", z.object({ stock: z.number() }))).rejects.toEqual(new ResponseFormatError());
    }
  });

  it("preserves caller cancellation and clears the timeout", async () => {
    vi.useFakeTimers();
    stubFetch(stalledResponse);
    const controller = new AbortController();

    const pending = request("/api/example", z.unknown(), { signal: controller.signal });
    // Attach the assertion before aborting, so the rejection is never left unhandled.
    const assertion = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();

    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("times out stalled requests without retrying them", async () => {
    vi.useFakeTimers();
    const fetch = stubFetch(stalledResponse);

    const assertion = expect(request("/api/example", z.unknown(), {}, { timeoutMs: 20 })).rejects.toBeInstanceOf(
      RequestTimeoutError,
    );
    await vi.advanceTimersByTimeAsync(20);

    await assertion;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not retry invalid responses, authorization failures, or conflicts", () => {
    for (const error of [
      new ResponseFormatError(),
      new ApiError(401, ""),
      new ApiError(403, ""),
      new ApiError(409, ""),
    ])
      expect(retryRead(0, error)).toBe(false);
    expect(retryRead(0, new TypeError("Network failure"))).toBe(true);
    expect(retryRead(2, new TypeError("Network failure"))).toBe(false);
  });
});
