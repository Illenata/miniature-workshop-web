import { and, count, desc, eq, sql, type SQL } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { collections, miniatures, reports } from "../db/schema.ts";
import { decodeCursor, encodeCursor } from "../lib/cursor.ts";
import { logAdminAction } from "./admin-auth.ts";

export const ADMIN_STATUS_FILTERS = ["all", "visible", "hidden", "removed"] as const;
export type AdminStatusFilter = (typeof ADMIN_STATUS_FILTERS)[number];
const PAGE_SIZE = 30;

export type AdminMiniature = {
  id: string;
  title: string;
  status: "visible" | "hidden" | "removed";
  hidden_reason: "reports" | "moderator" | null;
  collection: { id: string; name: string | null; status: "active" | "banned" };
  open_reports: number;
  views: number;
  created_at: string;
};

/**
 * Latest uploads for the moderator (spec section 7), newest first, any status.
 * Unlike the public lists this includes hidden and removed miniatures and banned collections.
 */
export async function listAdminMiniatures(db: Db, opts: { status: AdminStatusFilter; cursor?: string }) {
  const scope = `admin:${opts.status}`;
  const where: SQL[] = [];
  if (opts.status !== "all") where.push(eq(miniatures.status, opts.status));
  if (opts.cursor) {
    const c = decodeCursor(opts.cursor, scope);
    if (c && !Number.isNaN(Date.parse(c.key))) {
      where.push(sql`(${miniatures.createdAt}, ${miniatures.id}) < (${c.key}::timestamptz, ${c.id})`);
    }
  }

  const openReports = sql<number>`(select count(*)::int from ${reports}
    where ${reports.miniatureId} = ${miniatures.id} and ${reports.status} = 'open')`;

  const rows = await db
    .select({
      id: miniatures.id,
      title: miniatures.title,
      status: miniatures.status,
      hiddenReason: miniatures.hiddenReason,
      views: miniatures.views,
      createdAt: miniatures.createdAt,
      collectionId: collections.id,
      ownerName: collections.ownerName,
      collectionStatus: collections.status,
      openReports,
    })
    .from(miniatures)
    .innerJoin(collections, eq(collections.id, miniatures.collectionId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(miniatures.createdAt), desc(miniatures.id))
    .limit(PAGE_SIZE + 1);

  const page = rows.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  const items: AdminMiniature[] = page.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    hidden_reason: r.hiddenReason,
    collection: { id: r.collectionId, name: r.ownerName, status: r.collectionStatus },
    open_reports: r.openReports,
    views: r.views,
    created_at: r.createdAt.toISOString(),
  }));

  const byStatus = await db.select({ status: miniatures.status, n: count() }).from(miniatures).groupBy(miniatures.status);
  const counts = { all: 0, visible: 0, hidden: 0, removed: 0 };
  for (const row of byStatus) {
    counts[row.status] = row.n;
    counts.all += row.n;
  }

  return {
    items,
    counts,
    next_cursor:
      rows.length > PAGE_SIZE && last
        ? encodeCursor({ key: last.createdAt.toISOString(), id: last.id, scope })
        : null,
  };
}

export type ModerationResult = "ok" | "not_found" | "wrong_state";

/** Hide a visible miniature: it leaves the gallery, its page and files stop being served. */
export async function hideMiniature(db: Db, id: string): Promise<ModerationResult> {
  return db.transaction(async (tx) => {
    const [m] = await tx.select({ status: miniatures.status, title: miniatures.title }).from(miniatures).where(eq(miniatures.id, id));
    if (!m) return "not_found";
    if (m.status !== "visible") return "wrong_state";
    await tx
      .update(miniatures)
      .set({ status: "hidden", hiddenReason: "moderator", updatedAt: new Date() })
      .where(eq(miniatures.id, id));
    await logAdminAction(tx as unknown as Db, "hide_miniature", `${id} ${m.title}`);
    return "ok";
  });
}

/**
 * Show a hidden miniature again. The moderator has looked at it, so its open reports are
 * closed too: otherwise the very next report would hide it again straight away.
 */
export async function showMiniature(db: Db, id: string): Promise<ModerationResult> {
  return db.transaction(async (tx) => {
    const [m] = await tx.select({ status: miniatures.status, title: miniatures.title }).from(miniatures).where(eq(miniatures.id, id));
    if (!m) return "not_found";
    if (m.status !== "hidden") return "wrong_state";
    await tx
      .update(miniatures)
      .set({ status: "visible", hiddenReason: null, updatedAt: new Date() })
      .where(eq(miniatures.id, id));
    const closed = await tx
      .update(reports)
      .set({ status: "resolved" })
      .where(and(eq(reports.miniatureId, id), sql`${reports.status} = 'open'`))
      .returning({ id: reports.id });
    const note = closed.length ? ` (закрито скарг: ${closed.length})` : "";
    await logAdminAction(tx as unknown as Db, "show_miniature", `${id} ${m.title}${note}`);
    return "ok";
  });
}

/** Storage key of the small preview, for any miniature that still has files. */
export async function adminThumbKey(db: Db, id: string): Promise<string | null> {
  const [m] = await db.select({ status: miniatures.status, files: miniatures.files }).from(miniatures).where(eq(miniatures.id, id));
  if (!m || m.status === "removed") return null;
  return m.files.thumb400.key;
}
