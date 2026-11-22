import { describe, expect, it } from "vitest";

import { decodeProductListCursor, encodeProductListCursor } from "../product-list-cursor.logic.js";

/** Builds a well-formed token around a payload the server never issued, as an edited or hand-made cursor would be. */
function tokenFor(payload: unknown) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

describe("product list cursor", () => {
  it("round-trips the creation time to the millisecond and the ID", () => {
    const cursor = { createdAt: new Date("2026-11-21T09:30:00.123Z"), id: "cm3k2product" };

    const token = encodeProductListCursor(cursor);

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeProductListCursor(token)).toEqual(cursor);
  });

  it.each([
    ["an empty token", ""],
    ["text that is not base64url JSON", "page-2"],
    ["a JSON value that is not an object", tokenFor([1, 2])],
    ["a time that is not ISO 8601", tokenFor({ createdAt: "yesterday", id: "cm3k2product" })],
    ["a missing ID", tokenFor({ createdAt: "2026-11-21T09:30:00.123Z" })],
    ["an empty ID", tokenFor({ createdAt: "2026-11-21T09:30:00.123Z", id: "" })],
    ["an extra field", tokenFor({ createdAt: "2026-11-21T09:30:00.123Z", id: "cm3k2product", offset: 40 })],
  ])("rejects %s", (_name, token) => {
    expect(decodeProductListCursor(token)).toBeNull();
  });
});
