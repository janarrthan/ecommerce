import { request } from "../../shared/api/request";
import {
  pricingResponseSchema,
  productResponseSchema,
  productsResponseSchema,
  resolvedVariantSchema,
} from "./catalog.schemas";

const productsPath = "/api/storefront/products";
const productPath = (slug: string) => `${productsPath}/${encodeURIComponent(slug)}`;

/** Reads enabled currencies before a page requests prices, such as USD or EUR. */
export function readPricing(signal?: AbortSignal) {
  return request("/api/storefront/pricing", pricingResponseSchema, { signal });
}

/** Lists products using server-side search and category filtering. Empty filters are omitted. */
export function listProducts(currency: string, search: string, category: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ currency });
  if (search.trim()) query.set("search", search.trim());
  if (category.trim()) query.set("category", category.trim());
  return request(`${productsPath}?${query}`, productsResponseSchema, { signal });
}

/** Reads one product and server-resolved prices in the requested currency. */
export function readProduct(slug: string, currency: string, signal?: AbortSignal) {
  return request(`${productPath(slug)}?${new URLSearchParams({ currency })}`, productResponseSchema, { signal });
}

/** Resolves stable option-value IDs; each chosen value gets its own optionValueIds query parameter. */
export function resolveVariant(slug: string, valueIds: string[], currency: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ currency });
  for (const valueId of valueIds) query.append("optionValueIds", valueId);
  return request(`${productPath(slug)}/variant?${query}`, resolvedVariantSchema, { signal });
}
