import { and, asc, count, desc, eq, sql, type SQL } from "drizzle-orm";
import type { Faction, MiniatureItem, MiniatureList, Sort } from "@mw/contract";
import type { Db } from "../db/client.ts";
import { collections, dailyStats, miniatures, type MiniatureRow } from "../db/schema.ts";
import { collectionScope, decodeCursor, encodeCursor, galleryScope } from "../lib/cursor.ts";
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
 * One page of visible miniatures matching `filter`, in the given order. Keyset pagination
 * on (sort key, id): constant cost per page, no skipped or repeated rows when new uploads
 * arrive while someone scrolls. Cursors only work within the same `scope`.
 *
 * Status predicates are inlined (not bind parameters) so the planner can always match them
 * to the partial indexes, including with generic prepared-statement plans.
 */
async function listPage(
  db: Db,
  opts: { filter: SQL[]; scope: string; sort: Sort; cursor?: string; pageSize: number },
  urls: Urls,
): Promise<MiniatureList> {
  const order = ORDERS[opts.sort];
  const where: SQL[] = [sql`${miniatures.status} = 'visible'`, ...opts.filter];

  if (opts.cursor) {
    const c = decodeCursor(opts.cursor, opts.scope);
    if (!c || !order.validKey(c.key)) {
      throw new HttpError("invalid_request", "Malformed cursor or cursor for another filter", { field: "cursor" });
    }
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
      hasMore && last ? encodeCursor({ key: order.keyOf(last.m), id: last.m.id, scope: opts.scope }) : null,
  };
}

/** Gallery: visible miniatures of active collections not opted out of the gallery. */
export function listGallery(
  db: Db,
  opts: { faction?: Faction; sort: Sort; cursor?: string; pageSize: number },
  urls: Urls,
): Promise<MiniatureList> {
  const filter: SQL[] = [
    sql`${collections.status} = 'active'`,
    sql`${collections.hiddenFromGallery} = false`,
  ];
  if (opts.faction) filter.push(eq(miniatures.faction, opts.faction));
  return listPage(db, { ...opts, filter, scope: galleryScope(opts.faction, opts.sort) }, urls);
}

export type CollectionInfo = {
  id: string;
  url: string;
  /** Raw owner_name; null means the page shows "Workshop #<id>". */
  name: string | null;
  miniature_count: number;
  created_at: string;
};

export type CollectionLookup =
  | { kind: "ok"; collection: CollectionInfo; page: MiniatureList }
  | { kind: "missing" }; // also banned (spec section 6: banned or missing -> 404)

/**
 * A collection with one page of its visible miniatures (GET /api/v1/collections/{id}).
 * Collections opted out of the gallery are still reachable by link (spec section 9).
 */
export async function getCollectionPage(
  db: Db,
  id: string,
  opts: { sort: Sort; cursor?: string; pageSize: number },
  urls: Urls,
): Promise<CollectionLookup> {
  const [c] = await db
    .select({ id: collections.id, ownerName: collections.ownerName, createdAt: collections.createdAt })
    .from(collections)
    .where(and(eq(collections.id, id), sql`${collections.status} = 'active'`))
    .limit(1);
  if (!c) return { kind: "missing" };
  const [visibleCount] = await db
    .select({ n: count() })
    .from(miniatures)
    .where(and(eq(miniatures.collectionId, id), sql`${miniatures.status} = 'visible'`));

  const page = await listPage(
    db,
    { ...opts, filter: [eq(miniatures.collectionId, id)], scope: collectionScope(id, opts.sort) },
    urls,
  );
  return {
    kind: "ok",
    collection: {
      id: c.id,
      url: `${urls.publicBaseUrl}/c/${c.id}`,
      name: c.ownerName,
      miniature_count: visibleCount?.n ?? 0,
      created_at: c.createdAt.toISOString(),
    },
    page,
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
    await bumpDailyStat(db, "miniature_views");
  }
  return { kind: "ok", item: toItem(row, urls) };
}

/** Adds to today's (UTC) counter for the admin statistics. */
export async function bumpDailyStat(db: Db, metric: string, by = 1): Promise<void> {
  await db
    .insert(dailyStats)
    .values({ day: sql`(now() at time zone 'utc')::date`, metric, value: by })
    .onConflictDoUpdate({
      target: [dailyStats.day, dailyStats.metric],
      set: { value: sql`${dailyStats.value} + ${by}` },
    });
}
