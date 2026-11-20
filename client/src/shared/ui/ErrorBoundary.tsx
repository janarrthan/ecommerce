import { Component, type ReactNode } from "react";
import { reportError } from "../observability/telemetry";

type Props = {
  children: ReactNode;
  /** "application" replaces the whole screen; "page" replaces only the main content and keeps the header usable. */
  scope: "application" | "page";
  /** A value that clears the failure when it changes, such as the URL path after the customer opens another page. */
  resetKey?: string;
};
type State = { failed: boolean; resetKey: string | undefined };

/**
 * Shows a recovery screen when React cannot render a component, and reports that a rendering failure happened.
 *
 * Request failures are handled by their pages instead. A rendering failure is a programming error, such as reading
 * `variant.price` when `variant` is null, so it is reported without the error object, which could contain data.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  // A page boundary keyed by the URL path recovers when the customer navigates away from a broken product page.
  // Without this, the failure screen would stay visible on every later page until the browser reloaded.
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey === state.resetKey ? null : { failed: false, resetKey: props.resetKey };
  }

  componentDidCatch(): void {
    reportError({ category: "render", operation: `${this.props.scope}.render` });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.scope === "page")
      return (
        <section role="alert">
          <h1>This page could not be displayed</h1>
          <p>Try again, or choose another page from the navigation.</p>
          <button type="button" onClick={() => this.setState({ failed: false })}>
            Try again
          </button>
        </section>
      );
    return (
      <main>
        <h1>The page could not be displayed</h1>
        <p>Reload the page to try again.</p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload page
        </button>
      </main>
    );
  }
}
