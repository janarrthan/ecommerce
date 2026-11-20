import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError } from "../../shared/api/request";
import { reportRequestFailure } from "../../shared/observability/telemetry";
import { login, logout, readCsrfToken, readSession } from "./auth.api";
import { SessionContext, type Session } from "./session-context";
import type { LoginInput, User } from "./auth.schemas";

type SessionState = Pick<Session, "user" | "status" | "error" | "revalidationError" | "generation">;

const sessionEventKey = "storefront-session-change";
const changedSession = () => new DOMException("The session changed. Please try again.", "AbortError");

/**
 * Tells other tabs to check their session again. The stored value is only a random ID; passwords, user details,
 * cookies, and CSRF tokens never enter localStorage.
 */
function notifyOtherTabs() {
  try {
    localStorage.setItem(sessionEventKey, crypto.randomUUID());
  } catch {
    // Focus and online checks still run when storage is disabled.
  }
}

/**
 * Reports whether the server clearly refused the request, such as a wrong password (401) or too many attempts (429).
 *
 * The server checks credentials before it creates a session, so a refusal leaves every tab's session unchanged.
 * A lost response, a timeout, or a 503 is different: the server might have finished signing in before it failed.
 */
function refusedWithoutChange(error: unknown) {
  return error instanceof ApiError && error.status >= 400 && error.status < 500;
}

/**
 * Coordinates browser authentication and rejects work that belongs to an earlier session, such as Alice's cart write.
 *
 * The token is fetched before each mutation and lives only in that operation's memory.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({
    user: null,
    status: "loading",
    error: null,
    revalidationError: null,
    generation: 0,
  });

  const [busy, setBusy] = useState(false);
  const runtime = useRef({ user: null as User | null, generation: 0, controller: new AbortController() });
  const readController = useRef<AbortController | null>(null);
  const operationController = useRef<AbortController | null>(null);

  // True once the server has answered at least once, for example "Alice is signed in" or "nobody is signed in".
  const confirmed = useRef(false);

  const locked = useRef(false);
  const alive = useRef(true);

  const reset = useCallback(() => {
    runtime.current.controller.abort();
    runtime.current = { user: null, generation: runtime.current.generation + 1, controller: new AbortController() };
    return runtime.current.generation;
  }, []);

  const accept = useCallback(
    (user: User | null) => {
      if (runtime.current.user?.id !== user?.id) reset();

      runtime.current.user = user;
      confirmed.current = true;
      setState({ user, status: "ready", error: null, revalidationError: null, generation: runtime.current.generation });
    },
    [reset],
  );

  const expire = useCallback(() => {
    readController.current?.abort();
    const generation = reset();
    confirmed.current = true;
    setState({ user: null, status: "ready", error: null, revalidationError: null, generation });
  }, [reset]);

  const refresh = useCallback(async () => {
    if (locked.current || !alive.current) return;

    readController.current?.abort();
    const controller = new AbortController();
    readController.current = controller;

    try {
      const { user } = await readSession(controller.signal);
      if (!controller.signal.aborted) accept(user);
    } catch (error) {
      if (controller.signal.aborted) return;

      reportRequestFailure(error, "auth.session");

      // A 401 is a definite answer that nobody is signed in, so the private customer interface is retired.
      if (error instanceof ApiError && error.status === 401) {
        expire();
        return;
      }

      if (confirmed.current) {
        // A failed background check, such as a dropped connection when a phone returns to this tab, says nothing
        // about the server session. Keep Alice's customer interface and her unsaved form, and record the failure
        // so the page can offer "Check again". The server still rejects every write if her session really ended.
        setState((current) => ({ ...current, revalidationError: error }));
      } else {
        // The first check failed, so there is no confirmed customer to keep. The page shows a retry instead of
        // pretending the customer is signed out.
        setState({
          user: null,
          status: "error",
          error,
          revalidationError: null,
          generation: runtime.current.generation,
        });
      }
    }
  }, [accept, expire]);

  useEffect(() => {
    alive.current = true;

    // React Strict Mode runs this cleanup and setup again on the same refs during development. The cleanup aborted
    // the runtime controller, so give the same observed session a live controller; otherwise every later cart write
    // would start with an already-cancelled signal.
    if (runtime.current.controller.signal.aborted) {
      runtime.current = { ...runtime.current, controller: new AbortController() };
    }

    void refresh();

    const onFocus = () => {
      if (!document.hidden) void refresh();
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== sessionEventKey) return;

      // Another tab reports a real change, such as signing in as Bob. Retire this tab's customer work first, then
      // ask the server who is signed in now.
      operationController.current?.abort();
      expire();
      void refresh();
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    window.addEventListener("storage", onStorage);

    return () => {
      alive.current = false;
      readController.current?.abort();
      operationController.current?.abort();
      runtime.current.controller.abort();
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, [expire, refresh]);

  const { generation } = state;

  // Each generation receives its own function. A cart form rendered during generation 4 holds this generation-4
  // function, so a write it queues is rejected after Bob's session makes the current generation 6.
  const authenticated = useCallback(
    async <T,>(operation: (token: string, signal: AbortSignal) => Promise<T>): Promise<T> => {
      const current = runtime.current;
      if (current.generation !== generation) throw changedSession();
      if (!current.user) throw new ApiError(401, "Please sign in again.");

      try {
        const { csrfToken } = await readCsrfToken(current.controller.signal);
        if (current !== runtime.current) throw changedSession();

        const result = await operation(csrfToken, current.controller.signal);
        if (current !== runtime.current || current.controller.signal.aborted) throw changedSession();

        return result;
      } catch (error) {
        if (current === runtime.current && error instanceof ApiError && error.status === 401) expire();
        throw error;
      }
    },
    [expire, generation],
  );

  const signIn = useCallback(
    async (input: LoginInput) => {
      if (locked.current) throw new Error("A session operation is already running.");

      locked.current = true;
      setBusy(true);
      readController.current?.abort();
      const controller = new AbortController();
      operationController.current = controller;

      // Keep a signed-out customer's login form mounted during a rejected attempt so its error remains visible.
      // Replacing an authenticated session still retires that customer's work before sending new credentials.
      if (runtime.current.user) expire();
      let serverMayHaveChanged = true;

      try {
        const { user } = await login(input, controller.signal);
        if (controller.signal.aborted) throw changedSession();

        accept(user);
      } catch (error) {
        serverMayHaveChanged = !refusedWithoutChange(error);
        reportRequestFailure(error, "auth.login");
        throw error;
      } finally {
        locked.current = false;
        if (operationController.current === controller) operationController.current = null;
        if (alive.current) {
          setBusy(false);

          // A wrong password changes nothing, so other tabs keep their forms. A success, or a lost response that
          // might have signed in, makes them check again.
          if (serverMayHaveChanged) notifyOtherTabs();

          // A lost login response does not prove that the server failed to establish a session.
          await refresh();
        }
      }
    },
    [accept, expire, refresh],
  );

  const signOut = useCallback(async () => {
    if (locked.current) throw new Error("A session operation is already running.");
    locked.current = true;
    setBusy(true);
    readController.current?.abort();
    let serverMayHaveChanged = true;
    try {
      await authenticated((token, signal) => logout(token, signal));
      expire();
    } catch (error) {
      serverMayHaveChanged = !refusedWithoutChange(error);
      reportRequestFailure(error, "auth.logout");
      throw error;
    } finally {
      locked.current = false;
      if (alive.current) {
        setBusy(false);
        if (serverMayHaveChanged) notifyOtherTabs();
        await refresh();
      }
    }
  }, [authenticated, expire, refresh]);

  // Without useMemo, every render would create a new context object and re-render every session consumer, such as
  // each cart form, even when nothing they read had changed.
  const value = useMemo<Session>(
    () => ({ ...state, busy, refresh, signIn, signOut, expire, authenticated }),
    [state, busy, refresh, signIn, signOut, expire, authenticated],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
