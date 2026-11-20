import { useState } from "react";
import { Link, useLocation } from "react-router";
import { errorMessage } from "../../../shared/api/request";
import { loginPath } from "../auth.navigation";
import { useSession } from "../session-context";
import { SessionCheck } from "./SessionCheck";

/** Shows a sign-in link, or the signed-in customer's name with a sign-out button. */
function AccountControls() {
  const session = useSession();
  const location = useLocation();
  const [error, setError] = useState<unknown>(null);

  async function handleSignOut() {
    setError(null);
    try {
      await session.signOut();
    } catch (failure) {
      setError(failure);
    }
  }

  if (!session.user) {
    // The login page already shows the form, so a second "Sign in" link there would only point at itself.
    if (location.pathname === "/login") return null;

    // Returning here after sign-in keeps the product, its option choices, and the selected currency.
    return <Link to={loginPath(location.pathname + location.search)}>Sign in</Link>;
  }

  return (
    <div>
      <span>Signed in as {session.user.name}</span>{" "}
      <button type="button" disabled={session.busy} onClick={handleSignOut}>
        Sign out
      </button>
      {error !== null && <p role="alert">{errorMessage(error)}</p>}
      {session.revalidationError !== null && (
        <p role="status">
          We could not confirm your sign-in just now. You are still signed in on this page.{" "}
          <button type="button" onClick={() => void session.refresh()}>
            Check again
          </button>
        </p>
      )}
    </div>
  );
}

/** The account area above every page. It waits for the first session check before offering sign-in or sign-out. */
export function SessionMenu() {
  return (
    <SessionCheck>
      <AccountControls />
    </SessionCheck>
  );
}
