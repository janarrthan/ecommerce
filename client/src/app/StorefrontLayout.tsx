import type { ChangeEvent } from "react";
import { Outlet, useSearchParams } from "react-router";
import { usePricing } from "../features/catalog";
import { RequestError } from "../shared/ui/RequestError";
import styles from "./App.module.css";

/**
 * Chooses the currency for this page: the one requested in the URL when the store enables it, otherwise the base.
 *
 * For example, "?currency=EUR" shows EUR prices when EUR is enabled, while "?currency=XYZ" falls back to the store's
 * base currency, such as USD. The layout then explains the fallback instead of failing.
 */
function resolveCurrency(requested: string | null, enabled: { code: string }[], baseCurrency: string): string {
  return requested !== null && enabled.some((entry) => entry.code === requested) ? requested : baseCurrency;
}

/** Loads the store's currencies once, shows the currency selector, and renders the page that matches the URL. */
export function StorefrontLayout() {
  // The store configuration gates every storefront page, so it keeps the shared retry policy: a brief network
  // failure is retried twice before the customer sees an error.
  const pricing = usePricing();
  const [params, setParams] = useSearchParams();

  function handleCurrencyChange(event: ChangeEvent<HTMLSelectElement>) {
    // Copy the current parameters so a search, category, or option choice survives the currency change.
    const next = new URLSearchParams(params);
    next.set("currency", event.target.value);
    setParams(next);
  }

  if (pricing.isPending) return <p role="status">Loading store configuration…</p>;
  if (pricing.isError) return <RequestError error={pricing.error} retry={() => void pricing.refetch()} />;

  const requested = params.get("currency");
  const { currencies, baseCurrency } = pricing.data.pricing;
  const currency = resolveCurrency(requested, currencies, baseCurrency);
  // An empty "?currency=" is treated as no request, so it falls back without a notice.
  const fallbackNotice =
    requested && requested !== currency ? `That currency is not enabled. Showing ${currency}.` : null;

  return (
    <>
      <label className={styles.currency}>
        Currency
        <select value={currency} onChange={handleCurrencyChange}>
          {currencies.map((entry) => (
            <option key={entry.code} value={entry.code}>
              {entry.code}
            </option>
          ))}
        </select>
      </label>
      {fallbackNotice && <p role="status">{fallbackNotice}</p>}
      {/* Each child page reads this value with useStorefrontCurrency(). */}
      <Outlet context={currency} />
    </>
  );
}
