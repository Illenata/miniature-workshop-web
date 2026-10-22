import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import type { Faction, MiniatureItem, MiniatureList, Sort } from "@mw/contract";
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

type Order = {
  orderBy: SQL[];
  /** Rows strictly after the cursor in this order. */
  after: (key: string, id: string) => SQL;
  /** Rejects keys that would make the query fail (e.g. a hand-made cursor with a bad date). */
  validKey: (key: string) => boolean;
  keyOf: (m: MiniatureRow) => string;
};

/**
 * Titles mix English and Ukrainian, so they are compared with the "mw_title" ICU collation
 * (migration 0001): Ukrainian letter order (Ґ after Г, Є after Е, І and Ї after И),
 * Latin before Cyrillic, case-insensitive at first level. The expression matches the
 * title indexes exactly, so the planner can use them.
 */
const TITLE = sql`(${miniatures.title} collate "mw_title")`;

function dateOrder(dir: "asc" | "desc"): Order {
  const op = sql.raw(dir === "desc" ? "<" : ">");
  return {
    orderBy: dir === "desc"
      ? [desc(miniatures.createdAt), desc(miniatures.id)]
      : [asc(miniatures.createdAt), asc(miniatures.id)],
    after: (key, id) =>
      sql`(${miniatures.createdAt}, ${miniatures.id}) ${op} (${key}::timestamptz, ${id})`,
    validKey: (key) => /^\d{4}-\d{2}-\d{2}T/.test(key) && !Number.isNaN(Date.parse(key)),
    keyOf: (m) => m.createdAt.toISOString(),
  };
}

function titleOrder(dir: "asc" | "desc"): Order {
  const op = sql.raw(dir === "desc" ? "<" : ">");
  const d = sql.raw(dir);
  return {
    orderBy: [sql`${TITLE} ${d}`, dir === "desc" ? desc(miniatures.id) : asc(miniatures.id)],
    after: (key, id) =>
      sql`(${TITLE}, ${miniatures.id}) ${op} ((${key}::text collate "mw_title"), ${id})`,
    validKey: () => true,
    keyOf: (m) => m.title,
  };
}

const ORDERS: Record<Sort, Order> = {
  newest: dateOrder("desc"),
  oldest: dateOrder("asc"),
  title_asc: titleOrder("asc"),
  title_desc: titleOrder("desc"),
};

/**
 * Visible miniatures of active collections that are not opted out of the gallery.
 * Keyset pagination on (sort key, id): constant cost per page, no skipped or
 * repeated rows when new uploads arrive while someone scrolls.
 *
 * The status predicate is inlined (not a bind parameter) so the planner can always
 * match it to the partial indexes, including with generic prepared-statement plans.
 */
export async function listGallery(
  db: Db,
  opts: { faction?: Faction; sort: Sort; cursor?: string; pageSize: number },
  urls: Urls,
): Promise<MiniatureList> {
  const scope = galleryScope(opts.faction, opts.sort);
  const order = ORDERS[opts.sort];
  const where: SQL[] = [
    sql`${miniatures.status} = 'visible'`,
    sql`${collections.status} = 'active'`,
    sql`${collections.hiddenFromGallery} = false`,
  ];
  if (opts.faction) where.push(eq(miniatures.faction, opts.faction));

  if (opts.cursor) {
    const c = decodeCursor(opts.cursor, scope);
    if (!c || !order.validKey(c.key)) throw new HttpError("invalid_request", "Malformed cursor or cursor for another filter", { field: "cursor" });
    where.push(order.after(c.key, c.id));
  }

  const rows = await db
    .select(listColumns)
    .from(miniatures)
    .innerJoin(collections, eq(collections.id, miniatures.collectionId))
    .where(and(...where))
    .orderBy(...order.orderBy)
    .limit(opts.pageSize + 1);

  const page = rows.slice(0, opts.pageSize);
  const last = page.at(-1);
  const hasMore = rows.length > opts.pageSize;

  return {
    items: page.map((r) => toItem(r, urls)),
    next_cursor:
      hasMore && last ? encodeCursor({ key: order.keyOf(last.m), id: last.m.id, scope }) : null,
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

export type MiniatureLookup =
  | { kind: "ok"; item: MiniatureItem }
  | { kind: "hidden" } // hidden, removed, or its collection is banned
  | { kind: "missing" };

/**
 * One miniature by public id (GET /api/v1/miniatures/{id}). With `countView`, the page
 * view counter goes up by one first (spec section 6: +1 per page load, no dedup).
 */
export async function getMiniature(
  db: Db,
  id: string,
  urls: Urls,
  opts: { countView: boolean },
): Promise<MiniatureLookup> {
  const [row] = await db
    .select({ ...listColumns, collectionStatus: collections.status })
    .from(miniatures)
    .innerJoin(collections, eq(collections.id, miniatures.collectionId))
    .where(eq(miniatures.id, id))
    .limit(1);
  if (!row) return { kind: "missing" };
  if (row.m.status !== "visible" || row.collectionStatus !== "active") return { kind: "hidden" };

  if (opts.countView) {
    const [updated] = await db
      .update(miniatures)
      .set({ views: sql`${miniatures.views} + 1` })
      .where(eq(miniatures.id, id))
      .returning({ views: miniatures.views });
    if (updated) row.m.views = updated.views;
  }
  return { kind: "ok", item: toItem(row, urls) };
}
