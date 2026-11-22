import { infiniteQueryOptions, queryOptions, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { usePublicQueryClient } from "../../shared/api/public-query-context";
import { listCategories, listProducts, readPricing, readProduct, resolveVariant } from "./catalog.api";

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

/**
 * Defines the category-list query, such as Accessories, Apparel, and Workspace.
 *
 * The key has no currency, so switching from USD to EUR reuses the cached list instead of asking again. Categories
 * change rarely, so the list stays fresh for one minute.
 */
export function categoriesQueryOptions() {
  return queryOptions({
    queryKey: ["catalog", "categories"],
    queryFn: ({ signal }) => listCategories(signal),
    staleTime: 60_000,
    meta: { operation: "catalog.categories" },
  });
}

/** Loads the category choices for the product filters with the standard options. */
export function useCategories() {
  return useQuery(categoriesQueryOptions(), usePublicQueryClient());
}

/**
 * Defines the product list as a series of pages, such as the first 24 USD products in Apparel, then the next 24.
 *
 * The key holds the filters but not the cursor, so all loaded pages of one list are cached together. Each page's
 * `nextCursor` becomes the next request's cursor. When it is null, `hasNextPage` is false and the list is complete.
 */
export function productsQueryOptions(currency: string, search: string, category: string) {
  return infiniteQueryOptions({
    queryKey: ["catalog", "products", currency, search, category],
    queryFn: ({ pageParam, signal }) => listProducts(currency, search, category, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    meta: { operation: "catalog.products" },
  });
}

/** Loads the product pages with the standard query options, such as a USD hoodie search in Apparel. */
export function useProducts(currency: string, search: string, category: string) {
  return useInfiniteQuery(productsQueryOptions(currency, search, category), usePublicQueryClient());
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
