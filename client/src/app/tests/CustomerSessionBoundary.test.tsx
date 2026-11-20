import { useEffect, useState, StrictMode } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionProvider, useSession } from "../../features/auth";
import { PublicQueryContext } from "../../shared/api/public-query-context";
import { createQueryClient } from "../../shared/api/query-client";
import { installMockApi } from "../../test/mock-api";
import { userFixture } from "../../test/fixtures";
import { CustomerSessionBoundary } from "../CustomerSessionBoundary";

type Snapshot = ReturnType<typeof useSession> & { client: QueryClient };
const credentials = { email: "customer@example.com", password: "DemoPass123!" };
const sessionEventKey = "storefront-session-change";

function CustomerProbe({ observe }: { observe: (snapshot: Snapshot) => void }) {
  const session = useSession();
  const client = useQueryClient();
  const [note, setNote] = useState("");
  const location = useLocation();
  useEffect(() => observe({ ...session, client }), [session, client, observe]);
  return (
    <>
      <p>{session.user?.name ?? "Signed out"}</p>
      <p>{location.pathname}</p>
      <label>
        Delivery note
        <input value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
    </>
  );
}

function mount() {
  const publicClient = createQueryClient();
  let snapshot: Snapshot | undefined;
  const observe = (value: Snapshot) => {
    snapshot = value;
  };
  const view = render(
    <StrictMode>
      <PublicQueryContext.Provider value={publicClient}>
        <SessionProvider>
          <MemoryRouter initialEntries={["/cart"]}>
            <div data-testid="stable-shell">
              <CustomerSessionBoundary>
                <CustomerProbe observe={observe} />
              </CustomerSessionBoundary>
            </div>
          </MemoryRouter>
        </SessionProvider>
      </PublicQueryContext.Provider>
    </StrictMode>,
  );
  return {
    ...view,
    publicClient,
    get current() {
      if (!snapshot) throw new Error("The customer subtree has not mounted.");
      return snapshot;
    },
  };
}

/** Makes `/api/auth/me` fail like a dropped connection while `offline.value` is true. */
function installFlakySessionApi(offline: { value: boolean }) {
  return installMockApi({
    signedIn: true,
    intercept: (url) => {
      if (offline.value && url.pathname === "/api/auth/me") throw new TypeError("Offline");
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("customer session ownership", () => {
  it("replaces private data and form state while preserving the public cache, shell, and URL", async () => {
    installMockApi({ signedIn: true });
    const view = mount();
    await waitFor(() => expect(view.current.user).not.toBeNull());
    const oldClient = view.current.client;
    const shell = screen.getByTestId("stable-shell");
    oldClient.setQueryData(["customer", "private-note"], { note: "Alice's note" });
    view.publicClient.setQueryData(["catalog", "public-marker"], { name: "Cotton Hoodie" });
    await userEvent.setup().type(screen.getByLabelText("Delivery note"), "Leave at Alice's door");

    await act(async () => view.current.signOut());

    expect(view.current.user).toBeNull();
    expect(view.current.client).not.toBe(oldClient);
    expect(screen.getByLabelText("Delivery note")).toHaveValue("");
    expect(screen.getByTestId("stable-shell")).toBe(shell);
    expect(screen.getByText("/cart")).toBeVisible();
    expect(oldClient.getQueryCache().getAll()).toEqual([]);
    expect(view.current.client.getQueryCache().getAll()).toEqual([]);
    expect(view.publicClient.getQueryData(["catalog", "public-marker"])).toEqual({ name: "Cotton Hoodie" });
  });

  it("creates a new customer lifetime when the same customer signs in again", async () => {
    installMockApi({ signedIn: true });
    const view = mount();
    await waitFor(() => expect(view.current.user).not.toBeNull());
    const previous = view.current;
    await act(async () => view.current.signIn(credentials));
    expect(view.current.user?.id).toBe(previous.user?.id);
    expect(view.current.generation).toBeGreaterThan(previous.generation);
    expect(view.current.client).not.toBe(previous.client);
  });

  it("rejects a queued operation from an earlier session before it can send a mutation", async () => {
    installMockApi({ signedIn: true });
    const view = mount();
    await waitFor(() => expect(view.current.user).not.toBeNull());
    const oldAuthenticated = view.current.authenticated;
    await act(async () => view.current.signIn(credentials));
    const send = vi.fn(async () => "must not run");
    await expect(oldAuthenticated(send)).rejects.toMatchObject({ name: "AbortError" });
    expect(send).not.toHaveBeenCalled();
  });

  it("replaces state when another tab signs in as a different customer or renews the same customer's session", async () => {
    const api = installMockApi({ signedIn: true });
    const view = mount();
    await waitFor(() => expect(view.current.user).not.toBeNull());
    const aliceClient = view.current.client;
    api.changeUser({ ...userFixture(), id: "bob", name: "Bob", email: "bob@example.com" });
    await act(async () => {
      window.dispatchEvent(new StorageEvent("storage", { key: sessionEventKey, newValue: "bob-session" }));
    });
    await waitFor(() => expect(view.current.user?.id).toBe("bob"));
    expect(view.current.client).not.toBe(aliceClient);
    const bobClient = view.current.client;

    await act(async () => {
      window.dispatchEvent(new StorageEvent("storage", { key: sessionEventKey, newValue: "bob-renewed" }));
    });
    await waitFor(() => expect(view.current.user?.id).toBe("bob"));
    expect(view.current.client).not.toBe(bobClient);
  });

  it("keeps the confirmed customer, private cache, and unsaved form when a background check fails", async () => {
    const offline = { value: false };
    installFlakySessionApi(offline);
    const view = mount();
    await waitFor(() => expect(view.current.user).not.toBeNull());
    const client = view.current.client;
    const generation = view.current.generation;
    client.setQueryData(["customer", "private-marker"], "Alice");
    await userEvent.setup().type(screen.getByLabelText("Delivery note"), "Leave at the door");

    offline.value = true;
    await act(async () => view.current.refresh());

    // A dropped connection is not evidence that Alice signed out, so nothing private is discarded.
    expect(view.current.status).toBe("ready");
    expect(view.current.user).not.toBeNull();
    expect(view.current.revalidationError).toBeInstanceOf(TypeError);
    expect(view.current.generation).toBe(generation);
    expect(view.current.client).toBe(client);
    expect(client.getQueryData(["customer", "private-marker"])).toBe("Alice");
    expect(screen.getByLabelText("Delivery note")).toHaveValue("Leave at the door");

    offline.value = false;
    await act(async () => view.current.refresh());
    expect(view.current.revalidationError).toBeNull();
    expect(view.current.client).toBe(client);
  });

  it("shows a startup error when the first check fails and starts a customer lifetime after recovery", async () => {
    const offline = { value: true };
    installFlakySessionApi(offline);
    const view = mount();
    await waitFor(() => expect(view.current.status).toBe("error"));
    expect(view.current.user).toBeNull();
    const startupClient = view.current.client;

    offline.value = false;
    await act(async () => view.current.refresh());
    expect(view.current.status).toBe("ready");
    expect(view.current.user).not.toBeNull();
    expect(view.current.client).not.toBe(startupClient);
  });

  it("tells other tabs to check again after a sign-in but not after rejected credentials", async () => {
    installMockApi();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const view = mount();
    await waitFor(() => expect(view.current.status).toBe("ready"));

    await act(async () => {
      await expect(view.current.signIn({ ...credentials, password: "wrong-password" })).rejects.toMatchObject({
        status: 401,
      });
    });
    // The server refused before creating a session, so another tab's half-typed form must not be reset.
    expect(setItem).not.toHaveBeenCalledWith(sessionEventKey, expect.any(String));

    await act(async () => view.current.signIn(credentials));
    expect(setItem).toHaveBeenCalledWith(sessionEventKey, expect.any(String));
  });

  it("rejects a delayed token response after expiry without invoking the write", async () => {
    let finishToken: ((response: Response) => void) | undefined;
    installMockApi({
      signedIn: true,
      intercept: (url) => {
        if (url.pathname === "/api/auth/csrf-token") {
          return new Promise<Response>((resolve) => {
            finishToken = resolve;
          });
        }
      },
    });
    const view = mount();
    await waitFor(() => expect(view.current.user).not.toBeNull());
    const send = vi.fn(async () => "must not run");
    const pending = view.current.authenticated(send);
    const rejection = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await waitFor(() => expect(finishToken).toBeDefined());
    act(() => view.current.expire());
    finishToken!(Response.json({ csrfToken: "old-token" }));
    await rejection;
    expect(send).not.toHaveBeenCalled();
    expect(view.current.user).toBeNull();
  });
});
