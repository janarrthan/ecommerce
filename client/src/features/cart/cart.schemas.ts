import { z } from "zod";

const amount = z.number().int().nonnegative();
const price = z.object({
  amountMinor: amount,
  currency: z.string().regex(/^[A-Z]{3}$/),
  minorUnitDigits: z.number().int().min(0).max(4),
  source: z.enum(["explicit", "converted"]),
  baseAmountMinor: amount,
  baseCurrency: z.string().regex(/^[A-Z]{3}$/),
  exchangeRate: z.string().nullable(),
  rateProvider: z.string().nullable(),
  rateFetchedAt: z.iso.datetime().nullable(),
  rateExpiresAt: z.iso.datetime().nullable(),
});

/** Validates the cart response independently of the catalog feature, including retained unavailable items. */
export const cartSchema = z
  .object({
    id: z.string().nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    minorUnitDigits: z.number().int().min(0).max(4),
    itemCount: amount,
    totalQuantity: amount,
    subtotalAmountMinor: amount,
    isCheckoutReady: z.boolean(),
    createdAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime().nullable(),
    items: z.array(
      z.object({
        id: z.string(),
        quantity: z.number().int().positive(),
        availableQuantity: amount,
        availability: z.enum([
          "available",
          "product_inactive",
          "variant_inactive",
          "out_of_stock",
          "insufficient_stock",
        ]),
        unitPrice: price,
        lineTotalAmountMinor: amount,
        variant: z.object({
          id: z.string(),
          name: z.string(),
          sku: z.string(),
          options: z.array(
            z.object({
              optionId: z.string(),
              optionName: z.string(),
              optionPosition: amount,
              valueId: z.string(),
              value: z.string(),
            }),
          ),
          image: z
            .object({
              id: z.string(),
              url: z.url({ protocol: /^https?$/ }),
              altText: z.string().nullable(),
            })
            .nullable(),
          product: z.object({ id: z.string(), name: z.string(), slug: z.string() }),
        }),
      }),
    ),
  })
  .refine(
    (cart) =>
      cart.items.every(
        (item) => item.unitPrice.currency === cart.currency && item.unitPrice.minorUnitDigits === cart.minorUnitDigits,
      ),
    "Cart prices must use the response currency and precision.",
  );

export const cartResponseSchema = z.object({ cart: cartSchema });
export type Cart = z.infer<typeof cartSchema>;

/** Supplies session operations through application composition, without importing the auth feature. */
export type CartAccess = {
  customerId: string;
  authenticated: <T>(operation: (token: string, signal: AbortSignal) => Promise<T>) => Promise<T>;
  expire: () => void;
};
