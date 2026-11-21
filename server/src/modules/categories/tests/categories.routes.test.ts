import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../../app.js";
import { prisma } from "../../../shared/db/prisma.js";
import { SHARED_ERROR_CODES } from "../../../shared/errors/error-codes.js";

const storefrontCategoriesPath = "/api/storefront/categories";
const slugPrefix = "test-categories-";
const categorySlugs = ["workspace", "apparel", "archived-only", "empty", "twin-b", "twin-a"].map(
  (name) => `${slugPrefix}${name}`,
);
const productSlugs = ["desk-mat", "hoodie", "hidden-wallet", "twin-product"].map((name) => `${slugPrefix}${name}`);

async function removeFixtures() {
  // Delete products first. Their category links cascade with them, and then the categories have no links left.
  await prisma.product.deleteMany({ where: { slug: { in: productSlugs } } });
  await prisma.category.deleteMany({ where: { slug: { in: categorySlugs } } });
}

/**
 * Creates one category for each listing rule: listed, linked only to an archived product, unused, and two with the
 * same name. Apparel is linked to an active and an archived product, to prove it is still listed once.
 */
async function createFixtures() {
  const workspace = await prisma.category.create({ data: { name: "Test Workspace", slug: `${slugPrefix}workspace` } });
  const apparel = await prisma.category.create({ data: { name: "Test Apparel", slug: `${slugPrefix}apparel` } });

  const archivedOnly = await prisma.category.create({
    data: { name: "Test Archived Only", slug: `${slugPrefix}archived-only` },
  });

  await prisma.category.create({ data: { name: "Test Empty", slug: `${slugPrefix}empty` } });

  // The IDs are set so the tie-break order is known: "a" sorts before "b" although "b" is created first.
  const twinB = await prisma.category.create({
    data: { id: "test-categories-twin-b", name: "Test Twin", slug: `${slugPrefix}twin-b` },
  });

  const twinA = await prisma.category.create({
    data: { id: "test-categories-twin-a", name: "Test Twin", slug: `${slugPrefix}twin-a` },
  });

  await prisma.product.create({
    data: {
      name: "Test Desk Mat",
      slug: `${slugPrefix}desk-mat`,
      description: "Active product in Workspace.",
      categoryLinks: { create: [{ categoryId: workspace.id }] },
    },
  });
  await prisma.product.create({
    data: {
      name: "Test Hoodie",
      slug: `${slugPrefix}hoodie`,
      description: "Active product in Apparel.",
      categoryLinks: { create: [{ categoryId: apparel.id }] },
    },
  });
  await prisma.product.create({
    data: {
      name: "Test Hidden Wallet",
      slug: `${slugPrefix}hidden-wallet`,
      description: "Archived product in Apparel and Archived Only.",
      isActive: false,
      categoryLinks: { create: [{ categoryId: apparel.id }, { categoryId: archivedOnly.id }] },
    },
  });
  await prisma.product.create({
    data: {
      name: "Test Twin Product",
      slug: `${slugPrefix}twin-product`,
      description: "Active product in both Twin categories.",
      categoryLinks: { create: [{ categoryId: twinB.id }, { categoryId: twinA.id }] },
    },
  });
}

/** Keeps only this file's categories, so a category created by another fixture cannot change the result. */
async function listOwnedCategories() {
  const response = await request(app).get(storefrontCategoriesPath).expect(200);

  return (response.body.categories as { slug: string }[]).filter(({ slug }) => slug.startsWith(slugPrefix));
}

describe("storefront category routes", () => {
  beforeEach(removeFixtures);
  afterAll(removeFixtures);

  it("lists only categories with an active product, sorted by name with the ID breaking ties", async () => {
    await createFixtures();

    expect(await listOwnedCategories()).toEqual([
      { id: expect.any(String), name: "Test Apparel", slug: `${slugPrefix}apparel` },
      { id: "test-categories-twin-a", name: "Test Twin", slug: `${slugPrefix}twin-a` },
      { id: "test-categories-twin-b", name: "Test Twin", slug: `${slugPrefix}twin-b` },
      { id: expect.any(String), name: "Test Workspace", slug: `${slugPrefix}workspace` },
    ]);
  });

  it("removes a category when its last active product is archived and restores it when the product returns", async () => {
    await createFixtures();
    const workspaceSlug = `${slugPrefix}workspace`;
    const hasWorkspace = async () => (await listOwnedCategories()).some(({ slug }) => slug === workspaceSlug);

    await prisma.product.update({ where: { slug: `${slugPrefix}desk-mat` }, data: { isActive: false } });
    expect(await hasWorkspace()).toBe(false);

    await prisma.product.update({ where: { slug: `${slugPrefix}desk-mat` }, data: { isActive: true } });
    expect(await hasWorkspace()).toBe(true);
  });

  it("rejects query parameters, because the list is the same for every customer and currency", async () => {
    const response = await request(app).get(storefrontCategoriesPath).query({ currency: "EUR" }).expect(400);

    expect(response.body.error.code).toBe(SHARED_ERROR_CODES.VALIDATION_FAILED);
  });
});
