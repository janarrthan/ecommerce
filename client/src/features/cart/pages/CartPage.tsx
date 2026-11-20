import { useRef, useState } from "react";
import { Link } from "react-router";
import { RequestError } from "../../../shared/ui/RequestError";
import { formatMoney } from "../../../shared/lib/money";
import { useCart } from "../cart.queries";
import { QuantityForm } from "../components/QuantityForm";
import type { Cart, CartAccess } from "../cart.schemas";

type CartItem = Cart["items"][number];

const availabilityText: Record<CartItem["availability"], string> = {
  available: "Available",
  product_inactive: "This product is no longer available.",
  variant_inactive: "This variant is no longer available.",
  out_of_stock: "Out of stock.",
  insufficient_stock: "The saved quantity exceeds current stock. Choose a lower quantity.",
};

/**
 * Says whether the customer may choose a new quantity for this line.
 *
 * An archived product or variant cannot be bought again, so its line only offers removal. An out-of-stock line is
 * different: the product still exists, so it keeps the quantity form, which disables the field while stock is 0.
 */
function canChangeQuantity(item: CartItem): boolean {
  return item.availability !== "product_inactive" && item.availability !== "variant_inactive";
}

/** Lists the chosen options in display order, such as "Size: Large, Color: Blue". */
function describeOptions(item: CartItem): string {
  return item.variant.options.map((option) => `${option.optionName}: ${option.value}`).join(", ");
}

/** Displays the server's subtotal and retained unavailable lines without presenting an unfinished checkout. */
export function CartPage({ access, currency }: { access: CartAccess; currency: string }) {
  const query = useCart(access, currency);
  const heading = useRef<HTMLHeadingElement>(null);
  const [announcement, setAnnouncement] = useState("");

  // Removing a line deletes its form, including the focused Remove button. Announce the result in a live region
  // that stays on the page, and move focus to the cart heading so a keyboard user keeps their place.
  function announceRemoval(productName: string) {
    setAnnouncement(`${productName} was removed from your cart.`);
    heading.current?.focus();
  }

  if (query.isPending) return <p role="status">Loading your cart…</p>;
  if (query.isError) return <RequestError error={query.error} retry={() => void query.refetch()} />;
  const { cart } = query.data;

  return (
    <section>
      <h1 ref={heading} tabIndex={-1}>
        Your cart
      </h1>
      <p role="status">{announcement}</p>
      {query.isFetching && <p role="status">Refreshing prices and availability…</p>}
      {cart.items.length === 0 ? (
        <p>
          Your cart is empty. <Link to={`/?${new URLSearchParams({ currency })}`}>Browse products</Link>
        </p>
      ) : (
        <>
          <ul className="cartItems">
            {cart.items.map((item) => (
              <li key={item.id}>
                <h2>{item.variant.product.name}</h2>
                <p>{item.variant.name}</p>
                <p>{describeOptions(item)}</p>
                <p>{availabilityText[item.availability]}</p>
                <p>Unit price: {formatMoney(item.unitPrice.amountMinor, cart.currency, cart.minorUnitDigits)}</p>
                <p>Line total: {formatMoney(item.lineTotalAmountMinor, cart.currency, cart.minorUnitDigits)}</p>
                {/* Keyed by line only, so saving a new quantity keeps the form, its message, and focus. */}
                <QuantityForm
                  key={item.id}
                  access={access}
                  currency={currency}
                  variantId={item.variant.id}
                  stock={item.availableQuantity}
                  savedQuantity={item.quantity}
                  removable
                  disabled={query.isFetching}
                  canSet={canChangeQuantity(item)}
                  onRemoved={() => announceRemoval(item.variant.product.name)}
                />
              </li>
            ))}
          </ul>
          <p>
            <strong>
              Merchandise subtotal: {formatMoney(cart.subtotalAmountMinor, cart.currency, cart.minorUnitDigits)}
            </strong>
          </p>
          <p>Shipping, tax, discounts, and payment are not calculated by this page. Checkout is not available yet.</p>
        </>
      )}
    </section>
  );
}
