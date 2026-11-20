import { useContext, useEffect, useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { useSession } from "../features/auth";
import { CustomerQueryClientFactory } from "./customer-query-client";

function CustomerQueries({ children }: { children: ReactNode }) {
  const createClient = useContext(CustomerQueryClientFactory);
  // useState calls createClient once for this mounted instance, so each new generation receives a new cache.
  const [client] = useState(createClient);

  useEffect(() => {
    return () => {
      // Clear only this session's client. Bob has a different client, so Alice's cleanup cannot erase his cart.
      // Clearing mutation records cannot undo a sent write; SessionProvider also rejects outdated operations.
      void client.cancelQueries();
      client.clear();
    };
  }, [client]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/**
 * Gives customer screens and their cache the lifetime of one observed browser session.
 *
 * A new generation replaces the whole child tree, including cart forms and their errors. The generation changes
 * even when Alice signs back into the same account; a customer ID alone cannot distinguish those two sessions.
 */
export function CustomerSessionBoundary({ children }: { children: ReactNode }) {
  const { generation } = useSession();
  return <CustomerQueries key={generation}>{children}</CustomerQueries>;
}
