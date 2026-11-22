import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { resolveVariantPrice } from "../pricing/pricing.logic.js";
import { loadPricingContext } from "../pricing/pricing.service.js";
import { encodeProductListCursor } from "./product-list-cursor.logic.js";
import { getOptionKey, validateSelectedValueIds } from "./product-options.logic.js";
import type { ListProductsQuery, ProductSlugParams } from "./products.validation.js";

export const productImageSelect = {
  id: true,
  url: true,
  altText: true,
  position: true,
} satisfies Prisma.ProductImageSelect;

export const productOptionsSelect = {
  orderBy: [{ position: "asc" }, { id: "asc" }],
  select: {
    id: true,
    name: true,
    position: true,
    values: {
      orderBy: [{ position: "asc" }, { id: "asc" }],
      select: { id: true, value: true, position: true },
    },
  },
} satisfies Prisma.Product$optionsArgs;

export const productVariantSelect = {
  id: true,
  name: true,
  sku: true,
  stock: true,
  prices: {
    orderBy: { currencyCode: "asc" },
    select: { currencyCode: true, amountMinor: true },
  },
  optionValues: {
    orderBy: { optionId: "asc" },
    select: { optionId: true, valueId: true },
  },
} satisfies Prisma.ProductVariantSelect;

export const adminProductVariantSelect = {
  ...productVariantSelect,
  isActive: true,
} satisfies Prisma.ProductVariantSelect;

// Storefront queries need image records, while admin assignment queries need IDs only.
const storefrontProductVariantSelect = {
  ...productVariantSelect,
  imageLinks: {
    orderBy: [{ position: "asc" }, { imageId: "asc" }],
    select: {
      position: true,
      image: { select: productImageSelect },
    },
  },
} satisfies Prisma.ProductVariantSelect;

type ProductImageResponse = {
  id: string;
  url: string;
  altText: string | null;
  position: number;
};

function withStorefrontPriceAndImages<
  TVariant extends {
    prices: readonly { currencyCode: string; amountMinor: number }[];
    imageLinks: readonly {
      position: number;
      image: ProductImageResponse;
    }[];
  },
>(
  variant: TVariant,
  fallbackImages: readonly ProductImageResponse[],
  pricingContext: Awaited<ReturnType<typeof loadPricingContext>>,
) {
  const { imageLinks, prices, ...variantFields } = variant;
  // Link positions override product-level positions for this variant's gallery.
  // No explicit links means the product's general gallery is the fallback.
  const images =
    imageLinks.length > 0 ? imageLinks.map(({ image, position }) => ({ ...image, position })) : [...fallbackImages];

  return {
    ...variantFields,
    price: resolveVariantPrice(prices, pricingContext),
    images,
  };
}

const productListSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  options: productOptionsSelect,
  images: {
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: productImageSelect,
  },
  variants: {
    where: { isActive: true },
    orderBy: { sku: "asc" },
    select: storefrontProductVariantSelect,
  },
  categoryLinks: {
    select: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  },
} satisfies Prisma.ProductSelect;

/** Matches a name or description that contains the search text, such as "hoodie", in any letter case. */
function searchFilter(search: ListProductsQuery["search"]): Prisma.ProductWhereInput {
  if (!search) return {};

  return {
    OR: [
      { name: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ],
  };
}

/**
 * Matches the products that come after the cursor in newest-first order.
 *
 * @remarks Two products can share a creation time, so the ID decides between them. The `lte` bound repeats part of the
 * OR on purpose: PostgreSQL can use it to jump into the index, then the OR removes the few rows already shown.
 */
function afterCursor(cursor: ListProductsQuery["cursor"]): Prisma.ProductWhereInput {
  if (!cursor) return {};

  return {
    createdAt: { lte: cursor.createdAt },
    OR: [{ createdAt: { lt: cursor.createdAt } }, { id: { lt: cursor.id } }],
  };
}

/**
 * Lists one page of active products, newest first, such as the first 24 products in Apparel.
 *
 * @remarks `nextCursor` is null on the last page. Otherwise the client sends it back as `cursor` to get the next page.
 * Products added or archived between requests never make a product appear twice or get skipped.
 */
export async function listProducts(query: ListProductsQuery) {
  // Products, currency settings, and the cached rate come from one consistent database snapshot.
  return prisma.$transaction(
    async (tx) => {
      const pricingContext = await loadPricingContext(tx, query.currency);
      const rows = await tx.product.findMany({
        where: {
          isActive: true,
          categoryLinks: query.category
            ? {
                some: {
                  category: {
                    slug: query.category,
                  },
                },
              }
            : undefined,
          // Search and the cursor each need their own OR, so AND keeps them as two separate conditions.
          AND: [searchFilter(query.search), afterCursor(query.cursor)],
        },
        // This order must match afterCursor(), or pages would overlap. The Product index follows it for speed.
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        // One extra row shows whether another page exists, without a separate COUNT query.
        take: query.limit + 1,
        select: { ...productListSelect, createdAt: true },
      });

      const page = rows.slice(0, query.limit);
      const last = page.at(-1);

      return {
        // createdAt was read only for the cursor, so it is left out of each product.
        products: page.map(({ categoryLinks, variants, createdAt, ...product }) => ({
          ...product,
          variants: variants.map((variant) => withStorefrontPriceAndImages(variant, product.images, pricingContext)),
          categories: categoryLinks.map(({ category }) => category),
        })),
        nextCursor: rows.length > query.limit && last ? encodeProductListCursor(last) : null,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}

export async function getProductBySlug(productSlug: ProductSlugParams["productSlug"], currency?: string) {
  return prisma.$transaction(
    async (tx) => {
      const product = await tx.product.findFirst({
        where: {
          slug: productSlug,
          isActive: true,
        },
        select: productListSelect,
      });

      if (!product) {
        throw new HttpError(404, "Product not found.");
      }

      const pricingContext = await loadPricingContext(tx, currency);
      const { categoryLinks, variants, ...productFields } = product;

      return {
        ...productFields,
        variants: variants.map((variant) => withStorefrontPriceAndImages(variant, product.images, pricingContext)),
        categories: categoryLinks.map(({ category }) => category),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}

export async function resolveProductVariant(productSlug: string, optionValueIds: string[], currency?: string) {
  return prisma.$transaction(
    async (tx) => {
      const product = await tx.product.findFirst({
        where: { slug: productSlug, isActive: true },
        select: {
          id: true,
          options: productOptionsSelect,
          images: {
            orderBy: [{ position: "asc" }, { id: "asc" }],
            select: productImageSelect,
          },
        },
      });

      if (!product) {
        throw new HttpError(404, "Product not found.");
      }

      const pricingContext = await loadPricingContext(tx, currency);
      validateSelectedValueIds(product.options, optionValueIds);
      const variant = await tx.productVariant.findFirst({
        where: {
          productId: product.id,
          optionKey: getOptionKey(optionValueIds),
          isActive: true,
        },
        select: storefrontProductVariantSelect,
      });

      if (!variant) {
        return { variant: null, availability: "unavailable" as const };
      }

      return {
        variant: withStorefrontPriceAndImages(variant, product.images, pricingContext),
        availability: variant.stock > 0 ? ("in_stock" as const) : ("out_of_stock" as const),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
