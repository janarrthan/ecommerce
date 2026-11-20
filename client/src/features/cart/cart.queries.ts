import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../shared/api/request";
import { readCart, removeCartItem, setCartQuantity } from "./cart.api";
import type { CartAccess } from "./cart.schemas";

const customerKey = (access: CartAccess) => ["customer", access.customerId, "cart"] as const;
const cartKey = (access: CartAccess, currency: string) => [...customerKey(access), currency] as const;

/** Describes one cart write: set Large / Blue to an absolute quantity of 2, or remove Large / Blue. */
export type CartChange = { kind: "set"; variantId: string; quantity: number } | { kind: "remove"; variantId: string };

/** Loads a private cart and drops the browser session when the server returns 401. */
export function useCart(access: CartAccess, currency: string) {
  return useQuery({
    queryKey: cartKey(access, currency),
    staleTime: 0,
    meta: { operation: "cart.read" },
    queryFn: async ({ signal }) => {
      try {
        return await readCart(currency, signal);
      } catch (error) {
        if (!signal.aborted && error instanceof ApiError && error.status === 401) access.expire();
        throw error;
      }
    },
  });
}

/**
 * Serializes this customer's writes in this tab and refreshes the cart even after an uncertain network outcome.
 *
 * This does not lock other tabs or devices. The UI explicitly sets an absolute quantity and never implements an
 * increase by reading a quantity and adding to it locally.
 *
 * `onChanged` runs after the server confirms a write. It is passed to `useMutation` rather than to `mutate`, because
 * TanStack Query skips callbacks given to `mutate` when the calling component has unmounted. A removed cart line
 * unmounts its own form, yet the cart page still needs to announce "Everyday Cotton Hoodie was removed".
 */
export function useCartChange(access: CartAccess, currency: string, onChanged?: (change: CartChange) => void) {
  const client = useQueryClient();
  const mutationKey = [...customerKey(access), "write"];
  const pending = useIsMutating({ mutationKey }) > 0;
  const mutation = useMutation({
    mutationKey,
    meta: { operation: "cart.write" },
    scope: { id: `cart:${access.customerId}` },
    retry: false,
    mutationFn: (change: CartChange) =>
      access.authenticated((token, signal) =>
        change.kind === "set"
          ? setCartQuantity(change.variantId, change.quantity, currency, token, signal)
          : removeCartItem(change.variantId, currency, token, signal),
      ),
    onMutate: () => client.cancelQueries({ queryKey: customerKey(access) }),
    onSuccess: (result, change) => {
      client.setQueryData(cartKey(access, currency), result);
      onChanged?.(change);
    },
    onSettled: () => client.invalidateQueries({ queryKey: customerKey(access) }),
  });

  return { mutation, pending };
}
