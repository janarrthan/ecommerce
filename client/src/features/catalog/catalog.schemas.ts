import { z } from "zod";

const nonNegativeInteger = z.number().int().nonnegative();
const currencyCode = z.string().regex(/^[A-Z]{3}$/);
const precision = z.number().int().min(0).max(4);
const imageSchema = z.object({
  id: z.string().min(1),
  // Zod 4's z.url() accepts any scheme, such as javascript:, so the protocol option limits images to HTTP and HTTPS.
  url: z.url({ protocol: /^https?$/ }),
  altText: z.string().nullable(),
  position: nonNegativeInteger,
});

/** Validates the resolved price and its provenance; explicit USD prices have null exchange-rate fields. */
export const priceSchema = z.object({
  amountMinor: nonNegativeInteger,
  currency: currencyCode,
  minorUnitDigits: precision,
  source: z.enum(["explicit", "converted"]),
  baseAmountMinor: nonNegativeInteger,
  baseCurrency: currencyCode,
  exchangeRate: z.string().nullable(),
  rateProvider: z.string().nullable(),
  rateFetchedAt: z.iso.datetime().nullable(),
  rateExpiresAt: z.iso.datetime().nullable(),
});

/** Validates an active purchasable variant, such as Large / Blue with its own stock, price, and gallery. */
export const variantSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  sku: z.string(),
  stock: nonNegativeInteger,
  optionValues: z.array(z.object({ optionId: z.string(), valueId: z.string() })),
  price: priceSchema,
  images: z.array(imageSchema),
});

/** Validates one category, such as Apparel. An empty slug is rejected because it would clash with "All categories". */
const categorySchema = z.object({ id: z.string().min(1), name: z.string().min(1), slug: z.string().min(1) });

const optionSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: nonNegativeInteger,
  values: z.array(z.object({ id: z.string(), value: z.string(), position: nonNegativeInteger })),
});

/** Validates every catalog field returned by the current list and detail APIs. */
export const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  options: z.array(optionSchema),
  images: z.array(imageSchema),
  variants: z.array(variantSchema),
  categories: z.array(categorySchema),
});

/** Keeps availability consistent with variant presence and stock, so a null variant cannot be called in stock. */
export const resolvedVariantSchema = z.discriminatedUnion("availability", [
  z.object({ availability: z.literal("unavailable"), variant: z.null() }),
  z.object({
    availability: z.literal("out_of_stock"),
    variant: variantSchema.refine((variant) => variant.stock === 0),
  }),
  z.object({ availability: z.literal("in_stock"), variant: variantSchema.refine((variant) => variant.stock > 0) }),
]);

/**
 * Validates one page of the product list. `nextCursor` asks for the following page, and null means this is the last.
 *
 * @remarks A server from before pagination sends every product and no cursor. Reading a missing cursor as null lets this
 * client work with that server too, so the client and server can be deployed in either order.
 */
export const productsResponseSchema = z.object({
  products: z.array(productSchema),
  nextCursor: z.string().min(1).nullable().default(null),
});
export const productResponseSchema = z.object({ product: productSchema });
export const categoriesResponseSchema = z.object({ categories: z.array(categorySchema) });
export const pricingResponseSchema = z.object({
  pricing: z
    .object({
      baseCurrency: currencyCode,
      currencies: z.array(z.object({ code: currencyCode, minorUnitDigits: precision })).min(1),
    })
    .refine((pricing) => pricing.currencies.some(({ code }) => code === pricing.baseCurrency)),
});

export type Category = z.infer<typeof categorySchema>;
export type Product = z.infer<typeof productSchema>;
export type Variant = z.infer<typeof variantSchema>;
export type ResolvedVariant = z.infer<typeof resolvedVariantSchema>;
