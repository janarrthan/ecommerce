import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, RequestTimeoutError, ResponseFormatError } from "../../api/request";
import { createQueryClient } from "../../api/query-client";
import {
  classifyRequestFailure,
  reportError,
  reportRequestFailure,
  setTelemetrySink,
  type ErrorReport,
} from "../telemetry";

let restore: (() => void) | undefined;

afterEach(() => {
  restore?.();
  restore = undefined;
});

/** Replaces the sink for one test and returns the error reports it receives. */
function recordReports() {
  const reports: ErrorReport[] = [];
  restore = setTelemetrySink({ error: (report) => reports.push(report), vital: () => undefined });
  return reports;
}

describe("telemetry", () => {
  it("reports operational failures and ignores outcomes the page already explains", () => {
    expect(classifyRequestFailure(new ApiError(503, "Unavailable"))).toEqual({ category: "server", status: 503 });
    expect(classifyRequestFailure(new ResponseFormatError())).toEqual({ category: "response_format" });
    expect(classifyRequestFailure(new RequestTimeoutError())).toEqual({ category: "timeout" });
    expect(classifyRequestFailure(new TypeError("Failed to fetch"))).toEqual({ category: "network" });
    for (const expected of [
      new ApiError(401, "Please sign in again."),
      new ApiError(404, "Not found."),
      new ApiError(409, "The cart changed."),
      new DOMException("Request cancelled.", "AbortError"),
    ])
      expect(classifyRequestFailure(expected)).toBeNull();
  });

  it("replaces an operation name that could carry customer data", () => {
    const reports = recordReports();
    reportError({ category: "server", operation: "catalog.product" });
    reportError({ category: "server", operation: "/products/everyday-cotton-hoodie?search=alice@example.com" });
    reportRequestFailure(new RequestTimeoutError(), undefined);
    expect(reports.map((report) => report.operation)).toEqual(["catalog.product", "unnamed", "unnamed"]);
  });

  it("never lets a broken monitoring adapter throw into the page", () => {
    restore = setTelemetrySink({
      error: () => {
        throw new Error("Monitoring is down.");
      },
      vital: () => undefined,
    });
    expect(() => reportError({ category: "render", operation: "page.render" })).not.toThrow();
  });

  it("reports a failed query once with its operation name and without its key", async () => {
    const reports = recordReports();
    const client = createQueryClient();
    const read = vi.fn(async () => {
      throw new ApiError(503, "Unavailable");
    });
    await expect(
      client.fetchQuery({
        queryKey: ["customer", "test-customer", "cart", "USD"],
        queryFn: read,
        retry: false,
        meta: { operation: "cart.read" },
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(reports).toEqual([{ category: "server", status: 503, operation: "cart.read" }]);
    expect(JSON.stringify(reports)).not.toContain("test-customer");
  });
});
