import { RequestError } from "../../../shared/ui/RequestError";
import { useCart } from "../cart.queries";
import type { Cart, CartAccess } from "../cart.schemas";
import { QuantityForm } from "./QuantityForm";

/** Returns how many units of this variant the cart already holds, such as 2, or 0 when it is not in the cart. */
function savedQuantityOf(cart: Cart, variantId: string): number {
  return cart.items.find((item) => item.variant.id === variantId)?.quantity ?? 0;
}

/** Reads the existing cart before offering an explicit replacement quantity on a product page. */
export function SetCartQuantity({
  access,
  currency,
  variantId,
  stock,
  disabled,
}: {
  access: CartAccess;
  currency: string;
  variantId: string;
  stock: number;
  disabled: boolean;
}) {
  const query = useCart(access, currency);

  if (query.isPending) return <p role="status">Loading your cart…</p>;
  if (query.isError) return <RequestError error={query.error} retry={() => void query.refetch()} />;

  const existing = savedQuantityOf(query.data.cart, variantId);
  return (
    <section aria-label="Cart quantity">
      <p>Currently in your cart: {existing}.</p>
      {/* Keyed by variant only: a new saved quantity updates this form instead of replacing it. */}
      <QuantityForm
        key={variantId}
        access={access}
        currency={currency}
        variantId={variantId}
        stock={stock}
        savedQuantity={existing}
        disabled={disabled || query.isFetching}
      />
    </section>
  );
}
