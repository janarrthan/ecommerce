import { useRef, useState, type SubmitEvent } from "react";
import { ApiError, errorMessage } from "../../../shared/api/request";
import { loginInputSchema, type LoginInput } from "../auth.schemas";
import { useSession } from "../session-context";

/** Messages shown beside each login field, or below the button when the sign-in request itself fails. */
type LoginFormErrors = { email?: string; password?: string; request?: string };

/** The outcome of checking the login form in the browser, before anything is sent to the server. */
type LoginFormResult =
  | { valid: true; input: LoginInput }
  | { valid: false; errors: LoginFormErrors; firstInvalidField: "email" | "password" };

/**
 * Checks the submitted email and password before they are sent.
 *
 * For example, "alice@" returns the message "Enter a valid email address." and names `email` as the field to focus.
 * This check only saves a wasted request; the server still decides whether the credentials are correct.
 */
function validateLoginForm(fields: FormData): LoginFormResult {
  const result = loginInputSchema.safeParse({ email: fields.get("email"), password: fields.get("password") });
  if (result.success) return { valid: true, input: result.data };

  const badEmail = result.error.issues.some((issue) => issue.path[0] === "email");
  const badPassword = result.error.issues.some((issue) => issue.path[0] === "password");
  return {
    valid: false,
    errors: {
      email: badEmail ? "Enter a valid email address." : undefined,
      password: badPassword ? "Enter a password of at most 128 characters." : undefined,
    },
    firstInvalidField: badEmail ? "email" : "password",
  };
}

/**
 * Chooses the message for a sign-in that failed after it was sent.
 *
 * A 401 from the login request means the email or password was wrong, so it gets a specific message. Every other
 * failure, such as a dropped connection, uses the shared wording from `errorMessage()`.
 */
function loginFailureMessage(error: unknown): string {
  return error instanceof ApiError && error.status === 401 ? "Invalid email or password." : errorMessage(error);
}

/** Validates credentials locally, focuses the first invalid field, and leaves authentication to the server. */
export function LoginForm() {
  const { signIn, busy } = useSession();
  const [errors, setErrors] = useState<LoginFormErrors>({});
  const email = useRef<HTMLInputElement>(null);
  const password = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const result = validateLoginForm(new FormData(event.currentTarget));

    if (!result.valid) {
      setErrors(result.errors);
      // Move keyboard and screen-reader focus to the first field that needs fixing.
      (result.firstInvalidField === "email" ? email : password).current?.focus();
      return;
    }

    setErrors({});
    try {
      await signIn(result.input);
    } catch (error) {
      setErrors({ request: loginFailureMessage(error) });
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit}>
      <label htmlFor="login-email">Email</label>
      <input
        ref={email}
        id="login-email"
        name="email"
        type="email"
        autoComplete="username"
        required
        maxLength={254}
        aria-invalid={Boolean(errors.email)}
        aria-describedby={errors.email ? "email-error" : undefined}
        disabled={busy}
      />
      {errors.email && <p id="email-error">{errors.email}</p>}
      <label htmlFor="login-password">Password</label>
      <input
        ref={password}
        id="login-password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        maxLength={128}
        aria-invalid={Boolean(errors.password)}
        aria-describedby={errors.password ? "password-error" : undefined}
        disabled={busy}
      />
      {errors.password && <p id="password-error">{errors.password}</p>}
      <button type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      {errors.request && <p role="alert">{errors.request}</p>}
    </form>
  );
}
