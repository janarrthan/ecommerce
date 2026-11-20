import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SessionCheck } from "../components/SessionCheck";
import { SessionContext, type Session } from "../session-context";
import { userFixture } from "../../../test/fixtures";

/** A complete session value; each test changes only the fields it is about. */
function sessionWith(changes: Partial<Session>): Session {
  return {
    user: null,
    status: "ready",
    error: null,
    revalidationError: null,
    busy: false,
    generation: 1,
    refresh: vi.fn(async () => undefined),
    signIn: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
    expire: vi.fn(),
    authenticated: () => Promise.reject(new Error("Not used by SessionCheck.")),
    ...changes,
  };
}

function mount(session: Session) {
  return render(
    <SessionContext.Provider value={session}>
      <SessionCheck>
        <p>Cart controls</p>
      </SessionCheck>
    </SessionContext.Provider>,
  );
}

describe("session check", () => {
  it("hides its children while the first session check runs", () => {
    mount(sessionWith({ status: "loading" }));
    expect(screen.getByRole("status")).toHaveTextContent("Checking session…");
    expect(screen.queryByText("Cart controls")).not.toBeInTheDocument();
  });

  it("offers a retry instead of its children when the first check failed", async () => {
    const session = sessionWith({ status: "error", error: new TypeError("Failed to fetch") });
    mount(session);
    expect(screen.queryByText("Cart controls")).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(session.refresh).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["signed out", null],
    ["signed in", userFixture()],
  ])("shows its children once the check answered: %s", (_label, user) => {
    mount(sessionWith({ status: "ready", user }));
    expect(screen.getByText("Cart controls")).toBeVisible();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
