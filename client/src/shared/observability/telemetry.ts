import { ApiError, RequestTimeoutError, ResponseFormatError } from "../api/request";

/**
 * Names the kind of failure without carrying its details, such as "server" for a product read that returned 503.
 *
 * Expected outcomes are not failures here. A wrong password (401), a missing product (404), a cart conflict (409),
 * and a cancelled request are normal answers that the page already explains to the customer.
 */
export type ErrorCategory = "render" | "server" | "response_format" | "timeout" | "network";

/**
 * Describes one failure in a form that is safe to send to a monitoring service.
 *
 * The report never contains the thrown error, a response body, a URL, form values, or a query key. For example, a
 * cart read that times out becomes `{ category: "timeout", operation: "cart.read" }`. A query key would be unsafe
 * because cart keys contain the customer ID and product-list keys contain the customer's search text.
 */
export type ErrorReport = { category: ErrorCategory; operation: string; status?: number };

/** Describes one Core Web Vitals measurement, such as a product page's Largest Contentful Paint of 1,800 ms. */
export type VitalReport = { name: string; value: number; rating: "good" | "needs-improvement" | "poor" };

/** Receives reviewed telemetry. A monitoring adapter, such as one for Sentry, implements these two functions. */
export type TelemetrySink = { error: (report: ErrorReport) => void; vital: (report: VitalReport) => void };

// Operation names are fixed strings chosen in source code, such as "catalog.product" or "auth.login". Anything else
// is replaced, so a future caller cannot accidentally send a slug, an email address, or search text as a name.
const operationPattern = /^[a-z]+(\.[a-z_]+)+$/;

// The development sink prints to the browser console. Vitest also runs in development mode, so the test mode is
// excluded to keep expected test failures out of the output. Production builds send nothing until an adapter exists.
const developmentSink: TelemetrySink = {
  error: (report) => console.warn("[telemetry] error", report),
  vital: (report) => console.debug("[telemetry] vital", report),
};
const silentSink: TelemetrySink = { error: () => undefined, vital: () => undefined };
let sink: TelemetrySink = import.meta.env.DEV && import.meta.env.MODE !== "test" ? developmentSink : silentSink;

/**
 * Replaces the destination for telemetry and returns a function that restores the previous one.
 *
 * Temporary limitation: no external monitoring service is connected yet, so production reports are discarded. The
 * replacement is a small adapter, created once in `main.tsx`, that forwards these same redacted reports to the chosen
 * service. Tests use the returned function to restore the original sink after recording reports.
 */
export function setTelemetrySink(next: TelemetrySink): () => void {
  const previous = sink;
  sink = next;
  return () => {
    sink = previous;
  };
}

/**
 * Converts a request failure into a reportable category, or returns null for an expected outcome.
 *
 * For example, HTTP 503 becomes "server" with its status, while HTTP 409 returns null because the cart page already
 * explains a conflict. A `TypeError` is what `fetch` throws when the network is unreachable.
 */
export function classifyRequestFailure(error: unknown): Omit<ErrorReport, "operation"> | null {
  if (error instanceof ApiError) return error.status >= 500 ? { category: "server", status: error.status } : null;
  if (error instanceof ResponseFormatError) return { category: "response_format" };
  if (error instanceof RequestTimeoutError) return { category: "timeout" };
  if (error instanceof TypeError) return { category: "network" };
  return null;
}

/** Sends one redacted failure report. A broken monitoring adapter must never break the page that reported it. */
export function reportError(report: ErrorReport): void {
  try {
    sink.error({ ...report, operation: operationPattern.test(report.operation) ? report.operation : "unnamed" });
  } catch {
    // Telemetry is best effort. Rethrowing here would turn a monitoring outage into a customer-facing failure.
  }
}

/** Reports a failed request, such as a product read returning 503, and ignores expected outcomes such as 404. */
export function reportRequestFailure(error: unknown, operation: unknown): void {
  const failure = classifyRequestFailure(error);
  if (failure) reportError({ ...failure, operation: typeof operation === "string" ? operation : "unnamed" });
}

/** Sends one Core Web Vitals measurement; like error reports, it never throws into the page. */
export function reportVital(report: VitalReport): void {
  try {
    sink.vital(report);
  } catch {
    // A failed measurement upload must not interrupt the customer's browsing.
  }
}
