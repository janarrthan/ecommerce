import { createContext } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { createQueryClient } from "../shared/api/query-client";

/**
 * Supplies the function that creates each customer session's private cache, such as Alice's cart cache.
 *
 * The application uses the default, `createQueryClient`. A test supplies its own function that records every client
 * it creates, so it can check that Alice's retired cache was cleared. Without this seam, a test would have to replace
 * the module's exported function, which depends on how the test runner loads ES modules and can stop working silently.
 */
export const CustomerQueryClientFactory = createContext<() => QueryClient>(createQueryClient);
