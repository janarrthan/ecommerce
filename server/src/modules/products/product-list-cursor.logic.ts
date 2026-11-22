import { z } from "zod";

/** The last product on a page, such as `{ createdAt: 2026-11-21T09:30:00.000Z, id: "cm3k2..." }`. */
export type ProductListCursor = { createdAt: Date; id: string };

const cursorPayloadSchema = z.object({ createdAt: z.iso.datetime(), id: z.string().min(1) }).strict();

/**
 * Turns the last product on a page into the `nextCursor` token, such as `"eyJjcmVhdGVkQXQiOi..."`.
 *
 * @remarks The token holds the product's own sort values, not just its ID. The next page still works when that
 * product is archived or deleted in between, because nothing needs to look it up again.
 */
export function encodeProductListCursor(cursor: ProductListCursor): string {
  const payload = JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id });
  return Buffer.from(payload, "utf8").toString("base64url");
}

/** Reads a token made by `encodeProductListCursor`, or returns null when it is not one, such as `"page-2"`. */
export function decodeProductListCursor(token: string): ProductListCursor | null {
  try {
    const payload = cursorPayloadSchema.safeParse(JSON.parse(Buffer.from(token, "base64url").toString("utf8")));
    return payload.success ? { createdAt: new Date(payload.data.createdAt), id: payload.data.id } : null;
  } catch {
    // JSON.parse throws when the decoded text is not JSON. That is a bad token, not a server error.
    return null;
  }
}
