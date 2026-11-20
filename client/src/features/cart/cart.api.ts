import { request } from "../../shared/api/request";
import { cartResponseSchema } from "./cart.schemas";

const cartPath = "/api/storefront/cart";
const itemPath = (variantId: string, currency: string) =>
  `${cartPath}/items/${encodeURIComponent(variantId)}?${new URLSearchParams({ currency })}`;

/** Reads the authenticated customer's live currency-specific cart. */
export function readCart(currency: string, signal?: AbortSignal) {
  return request(`${cartPath}?${new URLSearchParams({ currency })}`, cartResponseSchema, { signal });
}

/** Sets the absolute quantity: sending 2 replaces an existing quantity of 3 with 2. */
export function setCartQuantity(
  variantId: string,
  quantity: number,
  currency: string,
  token: string,
  signal?: AbortSignal,
) {
  return request(itemPath(variantId, currency), cartResponseSchema, {
    method: "PUT",
    signal,
    headers: { "Content-Type": "application/json", "x-csrf-token": token },
    body: JSON.stringify({ quantity }),
  });
}

/** Removes an item idempotently; repeating the deletion does not remove a different item. */
export function removeCartItem(variantId: string, currency: string, token: string, signal?: AbortSignal) {
  return request(itemPath(variantId, currency), cartResponseSchema, {
    method: "DELETE",
    signal,
    headers: { "x-csrf-token": token },
  });
}
