import { createContext, useContext } from "react";
import type { LoginInput, User } from "./auth.schemas";

/** Describes the session capabilities that pages and application composition may use. */
export type Session = {
  user: User | null;

  /** "error" means the first session check failed, so the browser does not yet know who is signed in. */
  status: "loading" | "ready" | "error";
  error: unknown;

  /**
   * The failure from a later background check, such as a `/me` request that failed when the tab regained focus.
   *
   * The last confirmed customer stays signed in while this is set, because the browser has not learned that anything
   * changed. It returns to null after the next successful check.
   */
  revalidationError: unknown;
  busy: boolean;
  generation: number;
  refresh: () => Promise<void>;
  signIn: (input: LoginInput) => Promise<void>;
  signOut: () => Promise<void>;
  expire: () => void;
  authenticated: <T>(operation: (token: string, signal: AbortSignal) => Promise<T>) => Promise<T>;
};

export const SessionContext = createContext<Session | null>(null);

/** Reads the session boundary; callers must be rendered inside SessionProvider. */
export function useSession(): Session {
  const value = useContext(SessionContext);
  if (!value) throw new Error("SessionProvider is missing.");
  return value;
}
