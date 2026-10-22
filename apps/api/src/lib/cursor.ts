import { z } from "zod";
import { publicIdSchema, type Faction, type Sort } from "@mw/contract";

/**
 * Keyset cursor: the sort key and id of the last item on the page, plus the scope
 * (list, filter and order) it was made for. Opaque base64url JSON. A cursor from
 * another scope is rejected rather than silently producing a page that skips or
 * repeats items.
 *
 * The key is the ISO created_at for date orders and the title for title orders.
 */
export type Cursor = { key: string; id: string; scope: string };

const payloadSchema = z.object({
  k: z.string().max(256),
  i: publicIdSchema,
  s: z.string().max(64),
});

export function encodeCursor(c: Cursor): string {
  const json = JSON.stringify({ k: c.key, i: c.id, s: c.scope });
  return Buffer.from(json, "utf8").toString("base64url");
}

/** Returns null for anything malformed or made for another scope. */
export function decodeCursor(raw: string, expectedScope: string): Cursor | null {
  try {
    const json = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    const p = payloadSchema.parse(json);
    if (p.s !== expectedScope) return null;
    return { key: p.k, id: p.i, scope: p.s };
  } catch {
    return null;
  }
}

export function galleryScope(faction: Faction | undefined, sort: Sort): string {
  return `gallery:${faction ?? "all"}:${sort}`;
}

export function collectionScope(collectionId: string, sort: Sort): string {
  return `collection:${collectionId}:${sort}`;
}
