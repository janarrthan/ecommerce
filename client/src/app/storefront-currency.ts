import { useOutletContext } from "react-router";

/**
 * Returns the currency that `StorefrontLayout` chose for this page, such as "EUR".
 *
 * The layout passes it through `<Outlet context={currency} />`. A component outside that layout gets no value, so
 * this throws instead of letting the page show prices in a currency nobody checked.
 */
export function useStorefrontCurrency(): string {
  const currency = useOutletContext<string | undefined>();
  if (currency === undefined) throw new Error("useStorefrontCurrency must be used inside StorefrontLayout.");
  return currency;
}
