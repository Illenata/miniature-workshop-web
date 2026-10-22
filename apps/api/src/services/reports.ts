import { and, count, countDistinct, eq, gt, min, sql } from "drizzle-orm";
import type { ReportRequest } from "@mw/contract";
import type { Db } from "../db/client.ts";
import { collections, miniatures, reports } from "../db/schema.ts";

export type ReportLimits = { perIpPerDay: number; autoHideAt: number };

export type ReportOutcome =
  | { kind: "created"; autoHidden: boolean }
  | { kind: "duplicate" }
  | { kind: "not_found" }
  | { kind: "rate_limited"; retryAfter: number };

const DAY_MS = 86_400_000;

/**
 * Spec section 7: no sign-up; one open report per IP per miniature; at most N reports
 * a day per IP; reports from AUTO_HIDE_REPORTS different IPs hide the miniature until
 * the moderator looks at it.
 */
export async function createReport(
  db: Db,
  input: ReportRequest,
  ipHash: string,
  limits: ReportLimits,
  now = new Date(),
): Promise<ReportOutcome> {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: miniatures.id })
      .from(miniatures)
      .innerJoin(collections, eq(collections.id, miniatures.collectionId))
      .where(
        and(
          eq(miniatures.id, input.miniature_id),
          sql`${miniatures.status} = 'visible'`,
          sql`${collections.status} = 'active'`,
        ),
      )
      .limit(1);
    if (!target) return { kind: "not_found" };

    const since = new Date(now.getTime() - DAY_MS);
    const [recent] = await tx
      .select({ n: count(), oldest: min(reports.createdAt) })
      .from(reports)
      .where(and(eq(reports.ipHash, ipHash), gt(reports.createdAt, since)));
    if (recent && recent.n >= limits.perIpPerDay) {
      const oldest = recent.oldest ? new Date(recent.oldest).getTime() : now.getTime();
      const retryAfter = Math.max(1, Math.ceil((oldest + DAY_MS - now.getTime()) / 1000));
      return { kind: "rate_limited", retryAfter };
    }

    const inserted = await tx
      .insert(reports)
      .values({
        miniatureId: input.miniature_id,
        reason: input.reason,
        text: input.text.trim(),
        ipHash,
        createdAt: now,
      })
      .onConflictDoNothing({
        target: [reports.miniatureId, reports.ipHash],
        where: sql`status = 'open'`,
      })
      .returning({ id: reports.id });
    if (inserted.length === 0) return { kind: "duplicate" };

    const [distinct] = await tx
      .select({ ips: countDistinct(reports.ipHash) })
      .from(reports)
      .where(and(eq(reports.miniatureId, input.miniature_id), sql`${reports.status} = 'open'`));

    let autoHidden = false;
    if (distinct && distinct.ips >= limits.autoHideAt) {
      const hidden = await tx
        .update(miniatures)
        .set({ status: "hidden", hiddenReason: "reports", updatedAt: now })
        .where(and(eq(miniatures.id, input.miniature_id), sql`${miniatures.status} = 'visible'`))
        .returning({ id: miniatures.id });
      autoHidden = hidden.length > 0;
    }
    return { kind: "created", autoHidden };
  });
}
