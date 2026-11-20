import { request } from "../../shared/api/request";
import { csrfSchema, emptySchema, loginResponseSchema, sessionSchema, type LoginInput } from "./auth.schemas";

/** Reads the current server session; HTTP 200 with user null means signed out. */
export function readSession(signal?: AbortSignal) {
  return request("/api/auth/me", sessionSchema, { signal });
}

/** Signs in using the browser cookie flow; the server replaces the old session. */
export function login(input: LoginInput, signal?: AbortSignal) {
  return request("/api/auth/login", loginResponseSchema, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/** Obtains a token for the current session immediately before an authenticated mutation. */
export function readCsrfToken(signal?: AbortSignal) {
  return request("/api/auth/csrf-token", csrfSchema, { signal });
}

/** Ends the current session. The backend returns 204 without JSON. */
export function logout(csrfToken: string, signal?: AbortSignal) {
  return request(
    "/api/auth/logout",
    emptySchema,
    { method: "POST", signal, headers: { "x-csrf-token": csrfToken } },
    { response: "empty" },
  );
}
