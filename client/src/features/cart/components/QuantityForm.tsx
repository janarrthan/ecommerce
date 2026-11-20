import { useId, useState, type ChangeEvent, type SubmitEvent } from "react";
import { errorMessage } from "../../../shared/api/request";
import { useCartChange } from "../cart.queries";
import type { CartAccess } from "../cart.schemas";

/**
 * Reads the typed quantity as a whole number from 1 to the available stock, or returns null when it is not one.
 *
 * For example, with 4 in stock, "2" returns 2, while "0", "2.5", "7", and an empty field return null. The server
 * checks the stock again, because another customer may have bought the last units since this page loaded.
 */
function readQuantity(draft: string, stock: number): number | null {
  const value = Number(draft);
  return Number.isSafeInteger(value) && value >= 1 && value <= stock ? value : null;
}

/** Makes the backend's replacement semantics visible, including when an item is already in the cart. */
export function QuantityForm({
  access,
  currency,
  variantId,
  stock,
  savedQuantity,
  disabled = false,
  removable = false,
  canSet = true,
  onRemoved,
}: {
  access: CartAccess;
  currency: string;
  variantId: string;
  stock: number;
  /** The quantity the server currently has saved, or 0 when this variant is not in the cart. */
  savedQuantity: number;
  disabled?: boolean;
  removable?: boolean;
  canSet?: boolean;
  onRemoved?: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(String(savedQuantity || 1));
  const [syncedQuantity, setSyncedQuantity] = useState(savedQuantity);
  const [validation, setValidation] = useState("");
  const { mutation, pending } = useCartChange(access, currency, (change) => {
    if (change.kind === "remove") onRemoved?.();
  });

  // A new saved quantity, such as 2 after this form saved it or 5 saved from another tab, replaces the draft.
  // Adjusting state during rendering keeps this form mounted. If the caller remounted it with a key instead, the
  // "Cart quantity saved." message would vanish with the old mutation and keyboard focus would fall to the page.
  if (syncedQuantity !== savedQuantity) {
    setSyncedQuantity(savedQuantity);
    setDraft(String(savedQuantity || 1));
  }

  const blocked = disabled || pending;
  const cannotSet = blocked || stock === 0 || !canSet;
  const status = pending ? "Saving cart…" : mutation.isSuccess ? "Cart quantity saved." : "";

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (cannotSet) return;

    const quantity = readQuantity(draft, stock);
    if (quantity === null) {
      setValidation(`Enter a whole quantity from 1 to ${stock}.`);
      return;
    }

    setValidation("");
    mutation.mutate({ kind: "set", variantId, quantity });
  }

  function handleDraftChange(event: ChangeEvent<HTMLInputElement>) {
    setDraft(event.target.value);
    // A new draft makes the previous "Cart quantity saved." or failure message out of date.
    setValidation("");
    mutation.reset();
  }

  function handleRemove() {
    if (!blocked) mutation.mutate({ kind: "remove", variantId });
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor={id}>Total quantity in cart</label>
      {/* readOnly, unlike disabled, keeps keyboard focus in the field while a save or refresh is running. */}
      <input
        id={id}
        type="number"
        min="1"
        max={stock || 1}
        step="1"
        value={draft}
        readOnly={blocked}
        disabled={stock === 0 || !canSet}
        aria-describedby={`${id}-help`}
        aria-invalid={Boolean(validation)}
        onChange={handleDraftChange}
      />
      <p id={`${id}-help`}>This sets the total for this variant. It does not add to an existing quantity.</p>
      {/*
        aria-disabled keeps the button focusable. A button with the disabled attribute loses keyboard focus when a
        save starts, which sends a keyboard user back to the top of the page. The handlers check the same condition.
      */}
      <button type="submit" aria-disabled={cannotSet}>
        Set cart quantity
      </button>
      {removable && (
        <button type="button" aria-disabled={blocked} onClick={handleRemove}>
          Remove item
        </button>
      )}
      {validation && <p role="alert">{validation}</p>}
      <div role="status">{status}</div>
      {mutation.isError && (
        <p role="alert">
          {errorMessage(mutation.error)} The cart has been refreshed where possible. Check its current quantity before
          submitting again.
        </p>
      )}
    </form>
  );
}
