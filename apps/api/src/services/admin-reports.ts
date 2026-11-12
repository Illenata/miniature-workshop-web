import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { ReportReason } from "@mw/contract";
import type { Db } from "../db/client.ts";
import { collections, miniatures, reports } from "../db/schema.ts";
import { decodeCursor, encodeCursor } from "../lib/cursor.ts";
import { logAdminAction } from "./admin-auth.ts";
import type { ModerationResult } from "./admin-miniatures.ts";

const PAGE_SIZE = 30;
const SCOPE = "admin-reports";

export type AdminReport = { id: number; reason: ReportReason; text: string; created_at: string };

export type AdminReportedMiniature = {
  id: string;
  title: string;
  status: "visible" | "hidden" | "removed";
  hidden_reason: "reports" | "moderator" | null;
  collection: { id: string; name: string | null; status: "active" | "banned" };
  /** Open reports, newest first. */
  reports: AdminReport[];
  last_report_at: string;
};

/**
 * Moderation queue (spec section 7): every miniature that has open reports, the one
 * reported most recently first. Reports leave the queue when the moderator dismisses
 * them, shows the miniature again or removes it.
 */
export async function listReportQueue(db: Db, opts: { cursor?: string }) {
  const open = db
    .select({
      miniatureId: reports.miniatureId,
      // Same millisecond precision as the column, so the value survives the cursor round trip.
      lastAt: sql<Date>`max(${reports.createdAt})`.mapWith(reports.createdAt).as("last_at"),
    })
    .from(reports)
    .where(sql`${reports.status} = 'open'`)
    .groupBy(reports.miniatureId)
    .as("open_reports");

  const where: SQL[] = [];
  if (opts.cursor) {
    const c = decodeCursor(opts.cursor, SCOPE);
    if (c && !Number.isNaN(Date.parse(c.key))) {
      where.push(sql`(${open.lastAt}, ${miniatures.id}) < (${c.key}::timestamptz, ${c.id})`);
    }
  }

  const rows = await db
    .select({
      id: miniatures.id,
      title: miniatures.title,
      status: miniatures.status,
      hiddenReason: miniatures.hiddenReason,
      collectionId: collections.id,
      ownerName: collections.ownerName,
      collectionStatus: collections.status,
      lastAt: open.lastAt,
    })
    .from(open)
    .innerJoin(miniatures, eq(miniatures.id, open.miniatureId))
    .innerJoin(collections, eq(collections.id, miniatures.collectionId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(open.lastAt), desc(miniatures.id))
    .limit(PAGE_SIZE + 1);

  const page = rows.slice(0, PAGE_SIZE);
  const last = page.at(-1);

  const byMiniature = new Map<string, AdminReport[]>();
  if (page.length) {
    const texts = await db
      .select({
        id: reports.id,
        miniatureId: reports.miniatureId,
        reason: reports.reason,
        text: reports.text,
        createdAt: reports.createdAt,
      })
      .from(reports)
      .where(
        and(
          inArray(
            reports.miniatureId,
            page.map((r) => r.id),
          ),
          sql`${reports.status} = 'open'`,
        ),
      )
      .orderBy(desc(reports.createdAt), desc(reports.id));
    for (const t of texts) {
      const list = byMiniature.get(t.miniatureId) ?? [];
      list.push({ id: t.id, reason: t.reason, text: t.text, created_at: t.createdAt.toISOString() });
      byMiniature.set(t.miniatureId, list);
    }
  }

  const [totals] = await db
    .select({
      miniatures: sql<number>`count(distinct ${reports.miniatureId})::int`,
      reports: sql<number>`count(*)::int`,
    })
    .from(reports)
    .where(sql`${reports.status} = 'open'`);

  return {
    items: page.map(
      (r): AdminReportedMiniature => ({
        id: r.id,
        title: r.title,
        status: r.status,
        hidden_reason: r.hiddenReason,
        collection: { id: r.collectionId, name: r.ownerName, status: r.collectionStatus },
        reports: byMiniature.get(r.id) ?? [],
        last_report_at: r.lastAt.toISOString(),
      }),
    ),
    counts: { miniatures: totals?.miniatures ?? 0, reports: totals?.reports ?? 0 },
    next_cursor: rows.length > PAGE_SIZE && last ? encodeCursor({ key: last.lastAt.toISOString(), id: last.id, scope: SCOPE }) : null,
  };
}

/**
 * "Dismiss reports": the moderator looked and found nothing wrong. The open reports are
 * closed, and a miniature that the reports had hidden automatically becomes visible again,
 * because the only reason it was hidden is gone. One hidden by the moderator stays hidden.
 */
export async function dismissReports(db: Db, id: string): Promise<ModerationResult> {
  return db.transaction(async (tx) => {
    const [m] = await tx
      .select({ status: miniatures.status, hiddenReason: miniatures.hiddenReason, title: miniatures.title })
      .from(miniatures)
      .where(eq(miniatures.id, id));
    if (!m) return "not_found";

    const closed = await tx
      .update(reports)
      .set({ status: "resolved" })
      .where(and(eq(reports.miniatureId, id), sql`${reports.status} = 'open'`))
      .returning({ id: reports.id });
    // Nothing open: a second click or another tab got there first.
    if (closed.length === 0) return "wrong_state";

    const restore = m.status === "hidden" && m.hiddenReason === "reports";
    if (restore) {
      await tx
        .update(miniatures)
        .set({ status: "visible", hiddenReason: null, updatedAt: new Date() })
        .where(eq(miniatures.id, id));
    }
    const note = `(скарг: ${closed.length}${restore ? ", мініатюру показано" : ""})`;
    await logAdminAction(tx as unknown as Db, "dismiss_reports", `${id} ${m.title} ${note}`);
    return "ok";
  });
}
