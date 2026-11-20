import { queryOptions, useQuery } from "@tanstack/react-query";
import { usePublicQueryClient } from "../../shared/api/public-query-context";
import { listProducts, readPricing, readProduct, resolveVariant } from "./catalog.api";

/** Defines the enabled-currency query with a one-minute freshness period, such as a response containing USD and EUR. */
export function pricingQueryOptions() {
  return queryOptions({
    queryKey: ["catalog", "pricing"],
    queryFn: ({ signal }) => readPricing(signal),
    staleTime: 60_000,
    meta: { operation: "catalog.pricing" },
  });
}

/** Loads the pricing configuration, such as the enabled USD and EUR currencies, using the standard options. */
export function usePricing() {
  return useQuery(pricingQueryOptions(), usePublicQueryClient());
}

/** Separates cached catalog lists by currency, search text, and category. */
export function productsQueryOptions(currency: string, search: string, category: string) {
  return queryOptions({
    queryKey: ["catalog", "products", currency, search, category],
    queryFn: ({ signal }) => listProducts(currency, search, category, signal),
    meta: { operation: "catalog.products" },
  });
}

/** Loads products with the standard query options, such as a USD hoodie search in Apparel. */
export function useProducts(currency: string, search: string, category: string) {
  return useQuery(productsQueryOptions(currency, search, category), usePublicQueryClient());
}

/** Separates product details by slug and currency, so EUR cannot reuse a USD price response. */
export function productQueryOptions(slug: string, currency: string) {
  return queryOptions({
    queryKey: ["catalog", "product", slug, currency],
    queryFn: ({ signal }) => readProduct(slug, currency, signal),
    meta: { operation: "catalog.product" },
  });
}

/** Loads one product with the standard options, such as everyday-cotton-hoodie in USD. */
export function useProduct(slug: string, currency: string) {
  return useQuery(productQueryOptions(slug, currency), usePublicQueryClient());
}

/** Defines variant lookup, such as Large / Blue, with a stable key and a complete-selection condition. */
export function variantQueryOptions(slug: string, currency: string, valueIds: string[], complete: boolean) {
  const ids = [...valueIds].sort();
  return queryOptions({
    queryKey: ["catalog", "variant", slug, currency, ids],
    queryFn: ({ signal }) => resolveVariant(slug, ids, currency, signal),
    enabled: complete,
    meta: { operation: "catalog.variant" },
  });
}

/** Uses the standard options while waiting for a complete variant choice, such as Large / Blue. */
export function useVariant(slug: string, currency: string, valueIds: string[], complete: boolean) {
  return useQuery(variantQueryOptions(slug, currency, valueIds, complete), usePublicQueryClient());
}
