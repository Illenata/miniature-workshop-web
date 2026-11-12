import { and, desc, gte, like, lt, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { Db } from "../db/client.ts";
import { adminActions, collections, dailyStats, miniatures, reports } from "../db/schema.ts";

export const STATS_DAYS = 30;
const DAY_MS = 86_400_000;

/** Counter in daily_stats for miniature page views (written by services/miniatures.ts). */
export const VIEWS_METRIC = "miniature_views";
/**
 * Counters for refused uploads, one per error code of spec appendix B:
 * "upload_rejected:bad_glb" and so on. POST /api/v1/uploads writes them with bumpDailyStat.
 */
export const REJECTED_METRIC_PREFIX = "upload_rejected:";

export type StatsDay = { day: string; uploads: number; new_collections: number; views: number; reports: number };

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Rows per UTC day since `since`, as a map from "YYYY-MM-DD" to the count. */
async function countByDay(db: Db, table: typeof miniatures | typeof collections | typeof reports, column: PgColumn, since: Date) {
  // Spelled with the table name: see the note on unqualified columns in admin-collections.ts.
  const day = sql<string>`to_char(${column} at time zone 'utc', 'YYYY-MM-DD')`;
  const rows = await db
    .select({ day, n: sql<number>`count(*)::int` })
    .from(table)
    .where(gte(column, since))
    .groupBy(day);

  return new Map(rows.map((r) => [r.day, r.n]));
}

/**
 * Statistics for the last 30 days (spec section 7): uploads, new collections, miniature
 * page views, reports, and refused uploads by error code. Days are UTC days, the same ones
 * the daily counters are kept by; today is included and still growing.
 *
 * An upload is counted by the day its miniature first appeared, so a miniature removed
 * later still counts, and a re-share that replaces a miniature does not count again.
 */
export async function adminStats(db: Db, now = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const since = new Date(today.getTime() - (STATS_DAYS - 1) * DAY_MS);

  const [uploads, newCollections, reported, counters] = await Promise.all([
    countByDay(db, miniatures, miniatures.createdAt, since),
    countByDay(db, collections, collections.createdAt, since),
    countByDay(db, reports, reports.createdAt, since),
    db
      .select({ day: dailyStats.day, metric: dailyStats.metric, value: dailyStats.value })
      .from(dailyStats)
      .where(gte(dailyStats.day, isoDay(since))),
  ]);

  const views = new Map<string, number>();
  const rejected = new Map<string, number>();
  for (const row of counters) {
    if (row.metric === VIEWS_METRIC) {
      views.set(row.day, row.value);
    } else if (row.metric.startsWith(REJECTED_METRIC_PREFIX)) {
      const code = row.metric.slice(REJECTED_METRIC_PREFIX.length);
      rejected.set(code, (rejected.get(code) ?? 0) + row.value);
    }
  }

  // Newest day first, every day present even when nothing happened.
  const days: StatsDay[] = [];
  for (let i = 0; i < STATS_DAYS; i++) {
    const day = isoDay(new Date(today.getTime() - i * DAY_MS));
    days.push({
      day,
      uploads: uploads.get(day) ?? 0,
      new_collections: newCollections.get(day) ?? 0,
      views: views.get(day) ?? 0,
      reports: reported.get(day) ?? 0,
    });
  }

  const totals = { uploads: 0, new_collections: 0, views: 0, reports: 0 };
  for (const d of days) {
    totals.uploads += d.uploads;
    totals.new_collections += d.new_collections;
    totals.views += d.views;
    totals.reports += d.reports;
  }

  const rejections = [...rejected]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));

  return { days, totals, rejections };
}

const JOURNAL_PAGE_SIZE = 50;

/** The whole admin journal, newest first; `before` is the id the previous page ended on. */
export async function listAdminActions(db: Db, opts: { before?: number; action?: string }) {
  const where = [];
  if (opts.before) where.push(lt(adminActions.id, opts.before));
  if (opts.action === "moderation") where.push(sql`${adminActions.action} not like 'log%'`);
  else if (opts.action === "logins") where.push(like(adminActions.action, "log%"));

  const rows = await db
    .select()
    .from(adminActions)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(adminActions.id))
    .limit(JOURNAL_PAGE_SIZE + 1);
  const page = rows.slice(0, JOURNAL_PAGE_SIZE);

  return {
    items: page.map((r) => ({
      id: r.id,
      actor: r.actor,
      action: r.action,
      target: r.target,
      created_at: r.createdAt.toISOString(),
    })),
    next_before: rows.length > JOURNAL_PAGE_SIZE ? (page.at(-1)?.id ?? null) : null,
  };
}
