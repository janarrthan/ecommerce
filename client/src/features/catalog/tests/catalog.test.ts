import { afterEach, describe, expect, it, vi } from "vitest";
import { categoriesFixture, productFixture } from "../../../test/fixtures";
import {
  categoriesResponseSchema,
  productSchema,
  productsResponseSchema,
  resolvedVariantSchema,
} from "../catalog.schemas";
import { listProducts, resolveVariant } from "../catalog.api";
import { categoriesQueryOptions, productsQueryOptions } from "../catalog.queries";

afterEach(() => vi.unstubAllGlobals());

describe("catalog contracts", () => {
  it("keeps prices, precision, options, images, and categories in parsed products", () => {
    const product = productFixture();
    expect(productSchema.parse(product)).toEqual(product);
  });
  it("accepts unavailable and rejects contradictory availability or invalid stock", () => {
    const variant = productFixture().variants[0];
    expect(resolvedVariantSchema.parse({ variant: null, availability: "unavailable" }).variant).toBeNull();
    for (const response of [
      { variant: null, availability: "in_stock" },
      { variant, availability: "out_of_stock" },
      { variant: { ...variant, stock: -1 }, availability: "in_stock" },
    ])
      expect(resolvedVariantSchema.safeParse(response).success).toBe(false);
  });
  it("accepts the category list and rejects a category with an empty slug", () => {
    const categories = categoriesFixture();
    expect(categoriesResponseSchema.parse({ categories })).toEqual({ categories });
    const blank = { categories: [{ id: "blank", name: "Blank", slug: "" }] };
    expect(categoriesResponseSchema.safeParse(blank).success).toBe(false);
  });
  it("caches categories under one key that does not include the currency", () => {
    expect(categoriesQueryOptions().queryKey).toEqual(["catalog", "categories"]);
  });
  it("reads a missing cursor as the last page, so a server from before pagination still works", () => {
    expect(productsResponseSchema.parse({ products: [] })).toEqual({ products: [], nextCursor: null });
    expect(productsResponseSchema.safeParse({ products: [], nextCursor: "" }).success).toBe(false);
  });
  it("keeps every page of one list under a key without the cursor, and stops when the cursor is null", () => {
    const options = productsQueryOptions("USD", "hoodie", "apparel");
    expect(options.queryKey).toEqual(["catalog", "products", "USD", "hoodie", "apparel"]);
    expect(options.initialPageParam).toBeNull();
    expect(options.getNextPageParam({ products: [], nextCursor: "page-2" }, [], null, [])).toBe("page-2");
    expect(options.getNextPageParam({ products: [], nextCursor: null }, [], "page-2", [])).toBeNull();
  });
  it("asks for 24 products and sends the cursor only after the first page", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ products: [], nextCursor: null }));
    vi.stubGlobal("fetch", fetch);
    await listProducts("USD", "", "", null);
    await listProducts("USD", "", "apparel", "page-2");
    const [first, second] = fetch.mock.calls.map(([input]) => new URL(String(input), "https://storefront.example"));
    expect(Object.fromEntries(first.searchParams)).toEqual({ currency: "USD", limit: "24" });
    expect(Object.fromEntries(second.searchParams)).toEqual({
      currency: "USD",
      limit: "24",
      category: "apparel",
      cursor: "page-2",
    });
  });
  it("encodes path segments and preserves every selected option value", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ variant: null, availability: "unavailable" }));
    vi.stubGlobal("fetch", fetch);
    await resolveVariant("hoodie/special", ["large", "blue"], "USD");
    const url = new URL(fetch.mock.calls[0][0], "https://storefront.example");
    expect(url.pathname).toBe("/api/storefront/products/hoodie%2Fspecial/variant");
    expect(url.searchParams.getAll("optionValueIds")).toEqual(["large", "blue"]);
  });
});
