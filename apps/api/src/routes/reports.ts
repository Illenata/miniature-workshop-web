import type { FastifyInstance } from "fastify";
import { reportRequestSchema, type ReportResponse } from "@mw/contract";
import type { AppDeps } from "../app.ts";
import { HttpError } from "../lib/errors.ts";
import { hashIp } from "../lib/ip-hash.ts";
import { createReport } from "../services/reports.ts";

/** POST /api/v1/reports (spec section 8): no auth, limited per IP. */
export async function reportRoutes(app: FastifyInstance, deps: AppDeps) {
  app.post("/api/v1/reports", { bodyLimit: 8 * 1024 }, async (req, reply) => {
    const parsed = reportRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new HttpError("invalid_request", issue?.message ?? "Invalid report", {
        field: String(issue?.path[0] ?? ""),
      });
    }

    // req.ip honours X-Forwarded-For only from TRUST_PROXY peers (the proxy, the page server).
    const outcome = await createReport(deps.db, parsed.data, hashIp(req.ip, deps.config.IP_HASH_SALT), {
      perIpPerDay: deps.config.REPORTS_PER_IP_PER_DAY,
      autoHideAt: deps.config.AUTO_HIDE_REPORTS,
    });

    switch (outcome.kind) {
      case "not_found":
        throw new HttpError("not_found", "Miniature not found", { field: "miniature_id" });
      case "rate_limited":
        throw new HttpError("rate_limited", "Too many reports from this address", {
          retryAfter: outcome.retryAfter,
        });
      case "created":
        if (outcome.autoHidden) {
          req.log.info({ miniature: parsed.data.miniature_id }, "miniature auto-hidden by reports");
        }
        deps.notifier.reportCreated();
        break;
      case "duplicate":
        break;
    }
    const body: ReportResponse = { status: "received" };
    return reply.code(201).header("Cache-Control", "no-store").send(body);
  });
}
