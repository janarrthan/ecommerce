import type { ReactNode } from "react";
import { RequestError } from "../../../shared/ui/RequestError";
import { useSession } from "../session-context";

/**
 * Shows its children only after the first session check has answered, such as "Alice is signed in" or "nobody is".
 *
 * Until then it shows a status message, or a retry if that first check failed. Without it, a page could read "not
 * known yet" as "signed out" and show a sign-in link to a customer who is already signed in.
 */
export function SessionCheck({ children }: { children: ReactNode }) {
  const session = useSession();
  if (session.status === "loading") return <p role="status">Checking session…</p>;
  if (session.status === "error") return <RequestError error={session.error} retry={() => void session.refresh()} />;
  return children;
}
