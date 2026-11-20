import { createContext, useContext } from "react";
import type { QueryClient } from "@tanstack/react-query";

export const PublicQueryContext = createContext<QueryClient | null>(null);

/**
 * Reads the application-owned cache for public responses, such as the USD product catalog.
 *
 * A product page can sit inside the customer query provider because it also renders a private cart control.
 * Choosing this client explicitly keeps public products cached when Alice signs out and Bob signs in.
 */
export function usePublicQueryClient(): QueryClient {
  const client = useContext(PublicQueryContext);
  if (!client) throw new Error("PublicQueryContext is missing.");
  return client;
}
