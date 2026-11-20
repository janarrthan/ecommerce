import { useEffect, useState, type ReactNode } from "react";
import { BrowserRouter } from "react-router";
import { SessionProvider } from "../features/auth";
import { createQueryClient } from "../shared/api/query-client";
import { PublicQueryContext } from "../shared/api/public-query-context";
import { ErrorBoundary } from "../shared/ui/ErrorBoundary";

/** Keeps public catalog caching, authentication, and routing mounted when the customer subtree is replaced. */
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);

  useEffect(() => {
    // The public context only exposes this object. Mounting also connects stale catalog reads to focus and reconnect.
    // The private QueryClientProvider owns this setup for its own client; it cannot mount the public client for us.
    client.mount();
    return () => client.unmount();
  }, [client]);

  return (
    // The application boundary is the last resort for a failure in the providers themselves. App adds a nearer
    // page boundary so an ordinary page failure keeps the header and navigation usable.
    <ErrorBoundary scope="application">
      <PublicQueryContext.Provider value={client}>
        <SessionProvider>
          <BrowserRouter>{children}</BrowserRouter>
        </SessionProvider>
      </PublicQueryContext.Provider>
    </ErrorBoundary>
  );
}
