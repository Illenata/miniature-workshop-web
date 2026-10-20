import { z } from "zod";
import { factionSchema, publicIdSchema, type Faction } from "@mw/contract";

/**
 * Keyset cursor: the (created_at, id) of the last item on the page plus the filter
 * it was made for. Opaque base64url JSON; a cursor from another filter is rejected
 * rather than silently producing a page that skips or repeats items.
 */
export type Cursor = { createdAt: Date; id: string; scope: string };

const payloadSchema = z.object({
  t: z.iso.datetime(),
  i: publicIdSchema,
  s: z.string().max(64),
});

export function encodeCursor(c: Cursor): string {
  const json = JSON.stringify({ t: c.createdAt.toISOString(), i: c.id, s: c.scope });
  return Buffer.from(json, "utf8").toString("base64url");
}

/** Returns null for anything malformed or made for another scope. */
export function decodeCursor(raw: string, expectedScope: string): Cursor | null {
  try {
    const json = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    const p = payloadSchema.parse(json);
    if (p.s !== expectedScope) return null;
    return { createdAt: new Date(p.t), id: p.i, scope: p.s };
  } catch {
    return null;
  }
}

export function galleryScope(faction: Faction | undefined): string {
  return `gallery:${faction ? factionSchema.parse(faction) : "all"}`;
}

export function collectionScope(collectionId: string): string {
  return `collection:${collectionId}`;
}
