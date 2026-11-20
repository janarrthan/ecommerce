import { errorMessage } from "../api/request";

/** Shows a safe error and an explicit recovery action, such as reloading a failed product request. */
export function RequestError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div role="alert">
      <p>{errorMessage(error)}</p>
      <button type="button" onClick={retry}>
        Try again
      </button>
    </div>
  );
}
