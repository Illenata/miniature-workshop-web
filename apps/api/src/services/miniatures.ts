import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import type { Faction, MiniatureItem, MiniatureList } from "@mw/contract";
import type { Db } from "../db/client.ts";
import { collections, miniatures, type MiniatureRow } from "../db/schema.ts";
import { decodeCursor, encodeCursor, galleryScope } from "../lib/cursor.ts";
import { HttpError } from "../lib/errors.ts";

export type Urls = { publicBaseUrl: string; filesBaseUrl: string };

const listColumns = {
  m: miniatures,
  ownerName: collections.ownerName,
};

type ListRow = { m: MiniatureRow; ownerName: string | null };

export function toItem(row: ListRow, urls: Urls): MiniatureItem {
  const { m } = row;
  const file = (key: string) => `${urls.filesBaseUrl}/${key}`;
  return {
    id: m.id,
    url: `${urls.publicBaseUrl}/m/${m.id}`,
    title: m.title,
    description: m.description,
    faction: m.faction,
    owner: { collection_id: m.collectionId, name: row.ownerName },
    parts: m.parts,
    paints: m.paints,
    stroke_count: m.strokeCount,
    work_seconds: m.workSeconds,
    appraisal: (m.appraisal ?? null) as MiniatureItem["appraisal"],
    created_at: m.createdAt.toISOString(),
    updated_at: m.updatedAt.toISOString(),
    views: m.views,
    files: {
      glb: file(m.files.glb.key),
      card: file(m.files.card.key),
      thumb_400: file(m.files.thumb400.key),
      thumb_800: file(m.files.thumb800.key),
      og: file(m.files.og.key),
    },
  };
}

/**
 * Visible miniatures of active collections that are not opted out of the gallery,
 * newest first. Keyset pagination on (created_at, id): constant cost per page,
 * no skipped or repeated rows when new uploads arrive while someone scrolls.
 *
 * The status predicate is inlined (not a bind parameter) so the planner can always
 * match it to the partial indexes, including with generic prepared-statement plans.
 */
export async function listGallery(
  db: Db,
  opts: { faction?: Faction; cursor?: string; pageSize: number },
  urls: Urls,
): Promise<MiniatureList> {
  const scope = galleryScope(opts.faction);
  const where: SQL[] = [
    sql`${miniatures.status} = 'visible'`,
    sql`${collections.status} = 'active'`,
    sql`${collections.hiddenFromGallery} = false`,
  ];
  if (opts.faction) where.push(eq(miniatures.faction, opts.faction));

  if (opts.cursor) {
    const c = decodeCursor(opts.cursor, scope);
    if (!c) throw new HttpError("invalid_request", "Malformed cursor or cursor for another filter", { field: "cursor" });
    where.push(sql`(${miniatures.createdAt}, ${miniatures.id}) < (${c.createdAt.toISOString()}::timestamptz, ${c.id})`);
  }

  const rows = await db
    .select(listColumns)
    .from(miniatures)
    .innerJoin(collections, eq(collections.id, miniatures.collectionId))
    .where(and(...where))
    .orderBy(desc(miniatures.createdAt), desc(miniatures.id))
    .limit(opts.pageSize + 1);

  const page = rows.slice(0, opts.pageSize);
  const last = page.at(-1);
  const hasMore = rows.length > opts.pageSize;

  return {
    items: page.map((r) => toItem(r, urls)),
    next_cursor:
      hasMore && last ? encodeCursor({ createdAt: last.m.createdAt, id: last.m.id, scope }) : null,
  };
}

/**
 * Can the files of this miniature be served? Only visible miniatures of active collections.
 * (Opting out of the gallery keeps miniatures reachable by link, spec section 9.)
 */
export async function isServable(db: Db, collectionId: string, miniatureId: string): Promise<boolean> {
  const rows = await db
    .select({ one: sql<number>`1` })
    .from(miniatures)
    .innerJoin(collections, eq(collections.id, miniatures.collectionId))
    .where(
      and(
        eq(miniatures.id, miniatureId),
        eq(miniatures.collectionId, collectionId),
        sql`${miniatures.status} = 'visible'`,
        sql`${collections.status} = 'active'`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}
