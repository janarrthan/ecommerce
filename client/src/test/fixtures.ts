import type { Category, Product } from "../features/catalog/catalog.schemas";

/** Creates fresh response fixtures; changing one test's stock never changes the next test's product. */
export function productFixture(): Product {
  return {
    id: "hoodie",
    name: "Everyday Cotton Hoodie",
    slug: "everyday-cotton-hoodie",
    description: "A cotton hoodie.",
    images: [],
    categories: [{ id: "apparel", name: "Apparel", slug: "apparel" }],
    options: [
      {
        id: "size",
        name: "Size",
        position: 0,
        values: [
          { id: "medium", value: "Medium", position: 0 },
          { id: "large", value: "Large", position: 1 },
        ],
      },
      {
        id: "color",
        name: "Color",
        position: 1,
        values: [
          { id: "blue", value: "Blue", position: 0 },
          { id: "black", value: "Black", position: 1 },
        ],
      },
    ],
    variants: ["medium", "large"].map((size) => ({
      id: `${size}-blue`,
      name: `${size === "large" ? "Large" : "Medium"} / Blue`,
      sku: `HOODIE-${size}`,
      stock: 12,
      optionValues: [
        { optionId: "size", valueId: size },
        { optionId: "color", valueId: "blue" },
      ],
      images: [],
      price: {
        amountMinor: 6799,
        currency: "USD",
        minorUnitDigits: 2,
        source: "explicit",
        baseAmountMinor: 6799,
        baseCurrency: "USD",
        exchangeRate: null,
        rateProvider: null,
        rateFetchedAt: null,
        rateExpiresAt: null,
      },
    })),
  };
}

/**
 * Creates the category list, sorted by name as the server sends it. Only Apparel has a product in `productFixture`,
 * so seeing Accessories or Workspace proves the choices came from the category endpoint.
 */
export function categoriesFixture(): Category[] {
  return [
    { id: "accessories", name: "Accessories", slug: "accessories" },
    { id: "apparel", name: "Apparel", slug: "apparel" },
    { id: "workspace", name: "Workspace", slug: "workspace" },
  ];
}

export const userFixture = () => ({
  id: "test-customer",
  name: "Test Customer",
  email: "customer@example.com",
  roles: [],
});

/** Builds the server's cart envelope without calculating or mocking any payment workflow. */
export function cartFixture(quantity = 0, variantId = "large-blue") {
  const product = productFixture();
  const variant = product.variants.find((item) => item.id === variantId)!;

  return {
    cart: {
      id: quantity ? "test-cart" : null,
      currency: "USD",
      minorUnitDigits: 2,
      itemCount: quantity ? 1 : 0,
      totalQuantity: quantity,
      subtotalAmountMinor: quantity * variant.price.amountMinor,
      isCheckoutReady: quantity > 0,
      createdAt: null,
      updatedAt: null,
      items: quantity
        ? [
            {
              id: "test-item",
              quantity,
              availableQuantity: variant.stock,
              availability: "available",
              unitPrice: variant.price,
              lineTotalAmountMinor: quantity * variant.price.amountMinor,
              variant: {
                id: variant.id,
                name: variant.name,
                sku: variant.sku,
                image: null,
                options: [],
                product: { id: product.id, name: product.name, slug: product.slug },
              },
            },
          ]
        : [],
    },
  };
}
