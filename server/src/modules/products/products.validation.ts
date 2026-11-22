import { z } from "zod";

import { currencyCodeSchema } from "../pricing/pricing.validation.js";
import { decodeProductListCursor } from "./product-list-cursor.logic.js";

/** Products per page when the client does not ask for a size. 24 fills rows of 2, 3, or 4 columns evenly. */
export const PRODUCT_PAGE_SIZE_DEFAULT = 24;

/** The largest page a client may ask for, so one request cannot load the whole catalog. */
export const PRODUCT_PAGE_SIZE_MAX = 48;

// A real token is about 100 characters. The limit stops a huge value before any decoding work.
const productListCursorSchema = z
  .string()
  .max(256)
  .transform((token, ctx) => {
    const cursor = decodeProductListCursor(token);

    if (!cursor) {
      ctx.issues.push({
        code: "custom",
        input: token,
        message: "Cursor is not valid. Use the nextCursor from the previous page.",
      });
      return z.NEVER;
    }

    return cursor;
  });

export const listProductsQuerySchema = z
  .object({
    category: z.string().trim().min(1).optional(),
    search: z.string().trim().min(1).optional(),
    currency: currencyCodeSchema.optional(),
    // Query values arrive as text, such as "12", so coerce turns them into numbers before the checks run.
    limit: z.coerce.number().int().min(1).max(PRODUCT_PAGE_SIZE_MAX).default(PRODUCT_PAGE_SIZE_DEFAULT),
    cursor: productListCursorSchema.optional(),
  })
  .strict();

export const productSlugParamsSchema = z.object({
  productSlug: z.string().trim().min(1, "Product slug is required."),
});

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type ProductSlugParams = z.infer<typeof productSlugParamsSchema>;
