import { and, count, desc, eq, sql, type SQL } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { collections, miniatures } from "../db/schema.ts";
import { decodeCursor, encodeCursor } from "../lib/cursor.ts";
import { logAdminAction } from "./admin-auth.ts";

export const ADMIN_COLLECTION_FILTERS = ["all", "banned"] as const;
export type AdminCollectionFilter = (typeof ADMIN_COLLECTION_FILTERS)[number];
const PAGE_SIZE = 30;

export type AdminCollection = {
  id: string;
  name: string | null;
  status: "active" | "banned";
  /** Miniatures that still have files (visible or hidden). */
  miniature_count: number;
  created_at: string;
};

/** Collections for the moderator, newest first; "banned" is the list with the Unban button. */
export async function listAdminCollections(db: Db, opts: { status: AdminCollectionFilter; cursor?: string }) {
  const scope = `admin-collections:${opts.status}`;
  const where: SQL[] = [];
  if (opts.status === "banned") where.push(eq(collections.status, "banned"));
  if (opts.cursor) {
    const c = decodeCursor(opts.cursor, scope);
    if (c && !Number.isNaN(Date.parse(c.key))) {
      where.push(sql`(${collections.createdAt}, ${collections.id}) < (${c.key}::timestamptz, ${c.id})`);
    }
  }
  // Table names spelled out: drizzle leaves columns unqualified in a single-table select,
  // which would compare the subquery's own columns with each other.
  const miniatureCount = sql<number>`(select count(*)::int from ${miniatures} m
    where m.collection_id = ${collections}.id and m.status <> 'removed')`;

  const rows = await db
    .select({
      id: collections.id,
      ownerName: collections.ownerName,
      status: collections.status,
      createdAt: collections.createdAt,
      miniatureCount,
    })
    .from(collections)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(collections.createdAt), desc(collections.id))
    .limit(PAGE_SIZE + 1);

  const page = rows.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  const byStatus = await db.select({ status: collections.status, n: count() }).from(collections).groupBy(collections.status);
  const counts = { all: 0, banned: 0 };
  for (const row of byStatus) {
    counts.all += row.n;
    if (row.status === "banned") counts.banned = row.n;
  }
  return {
    items: page.map(
      (r): AdminCollection => ({
        id: r.id,
        name: r.ownerName,
        status: r.status,
        miniature_count: r.miniatureCount,
        created_at: r.createdAt.toISOString(),
      }),
    ),
    counts,
    next_cursor:
      rows.length > PAGE_SIZE && last ? encodeCursor({ key: last.createdAt.toISOString(), id: last.id, scope }) : null,
  };
}

type Result = "ok" | "not_found" | "wrong_state";

/**
 * Ban or unban a collection (spec section 7: ban by key = by collection). A banned
 * collection and all its miniatures answer 404 and its uploads will be refused with 403;
 * nothing is deleted, so unbanning brings everything back.
 */
export async function setCollectionBanned(db: Db, id: string, banned: boolean): Promise<Result> {
  return db.transaction(async (tx) => {
    const [c] = await tx.select({ status: collections.status, name: collections.ownerName }).from(collections).where(eq(collections.id, id));
    if (!c) return "not_found";
    if ((c.status === "banned") === banned) return "wrong_state";
    await tx.update(collections).set({ status: banned ? "banned" : "active" }).where(eq(collections.id, id));
    await logAdminAction(tx as unknown as Db, banned ? "ban_collection" : "unban_collection", `${id} ${c.name ?? ""}`.trim());
    return "ok";
  });
}
