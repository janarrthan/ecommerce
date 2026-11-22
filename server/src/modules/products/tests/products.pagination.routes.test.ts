import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../../app.js";
import { prisma } from "../../../shared/db/prisma.js";
import { SHARED_ERROR_CODES } from "../../../shared/errors/error-codes.js";
import { COMMERCE_SETTINGS_ID } from "../../pricing/pricing.constants.js";
import { encodeProductListCursor } from "../product-list-cursor.logic.js";

const storefrontProductsPath = "/api/storefront/products";
const slugPrefix = "test-paging-";
// Every fixture name contains this word, so a search for it returns only this file's products.
const searchWord = "Pagingfixture";

const oldest = new Date("2026-01-01T00:00:00.000Z");
const middle = new Date("2026-02-01T00:00:00.000Z");
const newest = new Date("2026-03-01T00:00:00.000Z");

type ProductPage = { products: { slug: string }[]; nextCursor: string | null };

async function removeFixtures() {
  await prisma.product.deleteMany({ where: { slug: { startsWith: slugPrefix } } });
}

async function ensurePricingSettings() {
  await prisma.commerceCurrency.upsert({
    where: { code: "USD" },
    update: { minorUnitDigits: 2, isEnabled: true },
    create: { code: "USD", minorUnitDigits: 2, isEnabled: true },
  });
  await prisma.commerceSettings.upsert({
    where: { id: COMMERCE_SETTINGS_ID },
    update: { baseCurrencyCode: "USD", rateTtlMinutes: 1440 },
    create: { id: COMMERCE_SETTINGS_ID, baseCurrencyCode: "USD", rateTtlMinutes: 1440 },
  });
}

/** Creates one product with a fixed time and ID, so its place in newest-first order is known. */
function productRow(name: string, createdAt: Date, isActive = true) {
  return {
    id: `${slugPrefix}${name}`,
    slug: `${slugPrefix}${name}`,
    name: `${searchWord} ${name}`,
    description: "Created by the pagination tests.",
    createdAt,
    isActive,
  };
}

/**
 * Creates five listed products and one archived product. B, C, and D share a creation time, so only the ID decides
 * their order. Newest first, the list is: a, d, c, b, e.
 */
async function createFixtures() {
  await prisma.product.createMany({
    data: [
      productRow("a", newest),
      productRow("b", middle),
      productRow("c", middle),
      productRow("d", middle),
      productRow("e", oldest),
      productRow("archived", middle, false),
    ],
  });
}

async function readPage(query: Record<string, string>): Promise<ProductPage> {
  const response = await request(app)
    .get(storefrontProductsPath)
    .query({ search: searchWord, ...query })
    .expect(200);
  return response.body;
}

const names = (page: ProductPage) => page.products.map(({ slug }) => slug.slice(slugPrefix.length));

describe("product list pagination", () => {
  beforeEach(async () => {
    await removeFixtures();
    await ensurePricingSettings();
  });

  afterAll(removeFixtures);

  it("walks every page once, newest first, using the ID to order products created at the same time", async () => {
    await createFixtures();

    const first = await readPage({ limit: "2" });
    const second = await readPage({ limit: "2", cursor: first.nextCursor! });
    const third = await readPage({ limit: "2", cursor: second.nextCursor! });

    expect(names(first)).toEqual(["a", "d"]);
    expect(names(second)).toEqual(["c", "b"]);
    expect(names(third)).toEqual(["e"]);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(second.nextCursor).toEqual(expect.any(String));
    expect(third.nextCursor).toBeNull();
  });

  it("does not repeat or skip a product when the catalog changes between pages", async () => {
    await createFixtures();
    const first = await readPage({ limit: "2" });

    // A new product moves every older product one place down. With page numbers, d would now open page 2 again.
    await prisma.product.create({ data: productRow("new", new Date("2026-04-01T00:00:00.000Z")) });
    // The cursor points at d. Archiving it must not break the next page, because the cursor holds d's own values.
    await prisma.product.update({ where: { id: `${slugPrefix}d` }, data: { isActive: false } });

    const second = await readPage({ limit: "2", cursor: first.nextCursor! });
    const third = await readPage({ limit: "2", cursor: second.nextCursor! });

    expect(names(first)).toEqual(["a", "d"]);
    expect(names(second)).toEqual(["c", "b"]);
    expect(names(third)).toEqual(["e"]);
  });

  it("returns 24 products by default and says when there are no more", async () => {
    await prisma.product.createMany({
      data: Array.from({ length: 25 }, (_, index) =>
        productRow(`bulk-${String(index).padStart(2, "0")}`, new Date(oldest.getTime() + index * 1000)),
      ),
    });

    const first = await readPage({});
    const second = await readPage({ cursor: first.nextCursor! });

    expect(first.products).toHaveLength(24);
    expect(names(first)[0]).toBe("bulk-24");
    expect(names(second)).toEqual(["bulk-00"]);
    expect(second.nextCursor).toBeNull();
  });

  it("returns an empty last page with no cursor when nothing matches", async () => {
    const page = await readPage({});

    expect(page).toEqual({ products: [], nextCursor: null });
  });

  it.each([
    ["a page size of 0", { limit: "0" }],
    ["a page size above 48", { limit: "49" }],
    ["a page size that is not a whole number", { limit: "2.5" }],
    ["a page size that is not a number", { limit: "many" }],
    ["a cursor the server did not issue", { cursor: "page-2" }],
    [
      "an edited cursor",
      {
        cursor: Buffer.from(JSON.stringify({ createdAt: "yesterday", id: "x" }), "utf8").toString("base64url"),
      },
    ],
    ["a cursor longer than 256 characters", { cursor: "a".repeat(257) }],
  ])("rejects %s with 400", async (_name, query) => {
    const response = await request(app).get(storefrontProductsPath).query(query).expect(400);

    expect(response.body.error.code).toBe(SHARED_ERROR_CODES.VALIDATION_FAILED);
  });

  it("accepts a cursor for a product that no longer exists", async () => {
    await createFixtures();
    // Points between c and b, as if a deleted product "bz" had been the last one on the previous page.
    const cursor = encodeProductListCursor({ createdAt: middle, id: `${slugPrefix}bz` });

    const page = await readPage({ limit: "5", cursor });

    expect(names(page)).toEqual(["b", "e"]);
  });
});
