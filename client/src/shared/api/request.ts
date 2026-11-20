/** Describes a response validator, such as the catalog's Zod product schema. */
type Parser<T> = { parse(value: unknown): T };

/** Represents a failed HTTP response, such as a cart update rejected with status 409. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** Rejects an unexpected response, such as HTTP 200 with stock expressed as "five". */
export class ResponseFormatError extends Error {
  constructor() {
    super("The server returned an unexpected response. Please try again later.");
    this.name = "ResponseFormatError";
  }
}

/** Reports that a request exceeded its time limit, such as a cart read taking over 15 seconds. */
export class RequestTimeoutError extends Error {
  constructor() {
    super("The request took too long. Please check your connection and try again.");
    this.name = "RequestTimeoutError";
  }
}

function readError(body: unknown) {
  if (typeof body !== "object" || body === null || !("error" in body)) return undefined;
  const error = body.error;
  if (typeof error !== "object" || error === null) return undefined;
  return {
    message: "message" in error && typeof error.message === "string" ? error.message : undefined,
    code: "code" in error && typeof error.code === "string" ? error.code : undefined,
  };
}

/**
 * Reads and validates a same-origin API response, such as GET /api/storefront/products.
 *
 * The helper never retries. A timed-out cart write might already have committed on the server, so its caller must
 * refresh the cart before the customer decides whether to submit another absolute quantity.
 */
export async function request<T>(
  path: string,
  parser: Parser<T>,
  init: RequestInit = {},
  options: { response?: "json" | "empty"; timeoutMs?: number } = {},
): Promise<T> {
  if (!path.startsWith("/api/") || path.includes("\\")) throw new Error("Expected a local /api/ path.");
  const timeoutMs = options.timeoutMs ?? 15_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("Expected a positive request timeout.");

  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort(init.signal?.reason);

  if (init.signal?.aborted) abort();
  else init.signal?.addEventListener("abort", abort, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const headers = new Headers(init.headers);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");

    const response = await fetch(path, {
      ...init,
      headers,
      credentials: "include",
      signal: controller.signal,
      redirect: "error",
    });

    // Keep the timeout active while reading the body, rather than stopping it after the response headers arrive.
    const text = await response.text();
    let body: unknown;
    let validJson = false;
    if (text.length > 0) {
      try {
        body = JSON.parse(text) as unknown;
        validJson = true;
      } catch {
        // A failed HTTP response must still become ApiError even when a proxy returns an HTML error page.
      }
    }

    if (!response.ok) {
      const error = readError(body);
      throw new ApiError(response.status, error?.message ?? "Request failed.", error?.code);
    }

    if (options.response === "empty") {
      if (response.status !== 204 || text.length > 0) throw new ResponseFormatError();
    } else if (!validJson || !response.headers.get("content-type")?.includes("application/json")) {
      throw new ResponseFormatError();
    }

    try {
      return parser.parse(body);
    } catch {
      // Zod's raw issues may include received values. Keep them out of customer messages and diagnostic logs.
      throw new ResponseFormatError();
    }
  } catch (error) {
    if (init.signal?.aborted) throw init.signal.reason ?? new DOMException("Request cancelled.", "AbortError");
    if (timedOut) throw new RequestTimeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", abort);
  }
}

/** Chooses customer-safe wording, such as a sign-in prompt for a cart request returning 401. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Please sign in again.";
    if (error.status === 403) return "Your session needs to be refreshed. Please try again.";
    if (error.status >= 500) return "The store is temporarily unavailable. Please try again later.";
    return error.message;
  }

  if (error instanceof ResponseFormatError || error instanceof RequestTimeoutError) return error.message;

  return "The request could not be completed. Check your connection and try again.";
}
