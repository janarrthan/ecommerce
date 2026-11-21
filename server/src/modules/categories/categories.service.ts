import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../shared/db/prisma.js";

// The storefront needs only these three fields. Timestamps and promotion links stay private.
const storefrontCategorySelect = {
  id: true,
  name: true,
  slug: true,
} satisfies Prisma.CategorySelect;

/**
 * Lists the categories a customer can filter by, such as Apparel and Workspace, sorted by name.
 *
 * @remarks
 * A category is listed only when at least one active product uses it, so choosing a category never leads to an empty
 * page. The ID breaks ties between equal names, so the order is the same on every request.
 */
export async function listStorefrontCategories() {
  return prisma.category.findMany({
    where: { productLinks: { some: { product: { isActive: true } } } },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: storefrontCategorySelect,
  });
}
