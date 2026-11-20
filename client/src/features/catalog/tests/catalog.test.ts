import { afterEach, describe, expect, it, vi } from "vitest";
import { productFixture } from "../../../test/fixtures";
import { productSchema, resolvedVariantSchema } from "../catalog.schemas";
import { resolveVariant } from "../catalog.api";

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
  it("encodes path segments and preserves every selected option value", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ variant: null, availability: "unavailable" }));
    vi.stubGlobal("fetch", fetch);
    await resolveVariant("hoodie/special", ["large", "blue"], "USD");
    const url = new URL(fetch.mock.calls[0][0], "https://storefront.example");
    expect(url.pathname).toBe("/api/storefront/products/hoodie%2Fspecial/variant");
    expect(url.searchParams.getAll("optionValueIds")).toEqual(["large", "blue"]);
  });
});
