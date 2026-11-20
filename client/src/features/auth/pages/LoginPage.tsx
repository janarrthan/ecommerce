import { Navigate, useSearchParams } from "react-router";
import { LoginForm } from "../components/LoginForm";
import { SessionCheck } from "../components/SessionCheck";
import { useSession } from "../session-context";
import { safeReturnTo } from "../auth.navigation";

/** Restores the selected local page after a confirmed sign-in. */
export function LoginPage() {
  const session = useSession();
  const [params] = useSearchParams();

  if (session.status === "ready" && session.user) return <Navigate to={safeReturnTo(params.get("returnTo"))} replace />;
  return (
    <section>
      <h1>Sign in</h1>
      <SessionCheck>
        <LoginForm />
      </SessionCheck>
    </section>
  );
}
