import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { reportRequestFailure } from "../observability/telemetry";
import { ApiError, RequestTimeoutError } from "./request";

// Gives every query and mutation an optional fixed operation name, such as "catalog.product" or "cart.write".
// TypeScript then checks `meta.operation` wherever a feature declares it, instead of accepting any value.
declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: { operation?: string };
    mutationMeta: { operation?: string };
  }
}

/** Retries temporary read failures twice; an invalid product schema or a rejected sign-in is not retried. */
export function retryRead(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (error instanceof ApiError) return [408, 502, 503, 504].includes(error.status);
  return error instanceof TypeError || error instanceof RequestTimeoutError;
}

/**
 * Creates a cache with shared request defaults, such as the public catalog cache or one session's private cart cache.
 *
 * The cache-level `onError` callbacks run once per failed request, after any retries, rather than once for every
 * component showing it. They report only the failure category and the operation name from `meta`.
 */
export function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({ onError: (error, query) => reportRequestFailure(error, query.meta?.operation) }),

    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => reportRequestFailure(error, mutation.meta?.operation),
    }),

    defaultOptions: {
      queries: { staleTime: 30_000, retry: retryRead },
      mutations: { retry: false },
    },
  });
}
