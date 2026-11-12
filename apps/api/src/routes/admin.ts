import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { isPublicId } from "@mw/contract";
import type { AppDeps } from "../app.ts";
import { hashIp } from "../lib/ip-hash.ts";
import { AdminAuth } from "../services/admin-auth.ts";
import {
  ADMIN_STATUS_FILTERS,
  adminThumbKey,
  hideMiniature,
  listAdminMiniatures,
  removeMiniature,
  showMiniature,
} from "../services/admin-miniatures.ts";
import { ADMIN_COLLECTION_FILTERS, listAdminCollections, setCollectionBanned } from "../services/admin-collections.ts";
import { dismissReports, listReportQueue } from "../services/admin-reports.ts";

const loginSchema = z.object({
  password: z.string().min(1).max(256),
  code: z.string().max(16),
});

function bearer(req: FastifyRequest): string {
  const header = req.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

/**
 * Admin backend (spec section 7). Not part of the public contract and never exposed by the
 * reverse proxy: only the page server calls /internal/admin/*, passing the session token
 * it keeps in the admin's cookie.
 */
export async function adminRoutes(app: FastifyInstance, deps: AppDeps) {
  const auth = new AdminAuth(deps.db, deps.config);
  const noStore = { "Cache-Control": "no-store" };

  app.post("/internal/admin/login", { bodyLimit: 4 * 1024 }, async (req, reply) => {
    reply.headers(noStore);
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(401).send({ error: "invalid_credentials" });

    const result = await auth.login(
      parsed.data.password,
      parsed.data.code.replace(/\s/g, ""),
      hashIp(req.ip, deps.config.IP_HASH_SALT),
    );
    switch (result.kind) {
      case "disabled":
        return reply.code(503).send({ error: "admin_disabled" });
      case "rate_limited":
        return reply
          .code(429)
          .header("Retry-After", result.retryAfter)
          .send({ error: "rate_limited", retry_after: result.retryAfter });
      case "invalid":
        return reply.code(401).send({ error: "invalid_credentials" });
      case "ok":
        return reply.send({ token: result.token, expires_at: result.expiresAt.toISOString() });
    }
  });

  // Everything below needs a valid session.
  app.register(async (secured) => {
    secured.addHook("preHandler", async (req, reply) => {
      reply.headers(noStore);
      const expiresAt = await auth.session(bearer(req));
      if (!expiresAt) return reply.code(401).send({ error: "unauthorized" });
      (req as FastifyRequest & { adminSessionExpiresAt: Date }).adminSessionExpiresAt = expiresAt;
    });

    secured.get("/internal/admin/session", async (req) => ({
      expires_at: (req as FastifyRequest & { adminSessionExpiresAt: Date }).adminSessionExpiresAt.toISOString(),
    }));

    secured.post("/internal/admin/logout", async (req, reply) => {
      await auth.logout(bearer(req));
      return reply.code(204).send();
    });

    secured.get<{ Querystring: { status?: string; cursor?: string } }>("/internal/admin/miniatures", async (req) => {
      const status = ADMIN_STATUS_FILTERS.find((s) => s === req.query.status) ?? "all";
      return listAdminMiniatures(deps.db, { status, cursor: req.query.cursor });
    });

    for (const [verb, run] of [["hide", hideMiniature], ["show", showMiniature]] as const) {
      secured.post<{ Params: { id: string } }>(`/internal/admin/miniatures/:id/${verb}`, async (req, reply) => {
        if (!isPublicId(req.params.id)) return reply.code(404).send({ error: "not_found" });
        const result = await run(deps.db, req.params.id);
        if (result === "not_found") return reply.code(404).send({ error: "not_found" });
        // Already in that state (double click, or changed meanwhile): tell the page to refresh.
        if (result === "wrong_state") return reply.code(409).send({ error: "wrong_state" });
        return reply.code(204).send();
      });
    }

    // Erases the files for good. On a storage error (500) the miniature stays hidden and
    // the request can simply be repeated.
    secured.post<{ Params: { id: string } }>("/internal/admin/miniatures/:id/remove", async (req, reply) => {
      if (!isPublicId(req.params.id)) return reply.code(404).send({ error: "not_found" });
      const result = await removeMiniature(deps.db, deps.storage, req.params.id);
      if (result === "not_found") return reply.code(404).send({ error: "not_found" });
      if (result === "wrong_state") return reply.code(409).send({ error: "wrong_state" });
      return reply.code(204).send();
    });

    // Moderation queue: miniatures with open reports, and the button that closes them.
    secured.get<{ Querystring: { cursor?: string } }>("/internal/admin/reports", async (req) =>
      listReportQueue(deps.db, { cursor: req.query.cursor }),
    );

    secured.post<{ Params: { id: string } }>("/internal/admin/miniatures/:id/dismiss-reports", async (req, reply) => {
      if (!isPublicId(req.params.id)) return reply.code(404).send({ error: "not_found" });
      const result = await dismissReports(deps.db, req.params.id);
      if (result === "not_found") return reply.code(404).send({ error: "not_found" });
      if (result === "wrong_state") return reply.code(409).send({ error: "wrong_state" });
      return reply.code(204).send();
    });

    secured.get<{ Querystring: { status?: string; cursor?: string } }>("/internal/admin/collections", async (req) => {
      const status = ADMIN_COLLECTION_FILTERS.find((s) => s === req.query.status) ?? "all";
      return listAdminCollections(deps.db, { status, cursor: req.query.cursor });
    });

    for (const verb of ["ban", "unban"] as const) {
      secured.post<{ Params: { id: string } }>(`/internal/admin/collections/:id/${verb}`, async (req, reply) => {
        if (!isPublicId(req.params.id)) return reply.code(404).send({ error: "not_found" });
        const result = await setCollectionBanned(deps.db, req.params.id, verb === "ban");
        if (result === "not_found") return reply.code(404).send({ error: "not_found" });
        if (result === "wrong_state") return reply.code(409).send({ error: "wrong_state" });
        return reply.code(204).send();
      });
    }

    // Previews also for hidden miniatures, which the public files route refuses to serve.
    secured.get<{ Params: { id: string } }>("/internal/admin/miniatures/:id/thumb", async (req, reply) => {
      const key = isPublicId(req.params.id) ? await adminThumbKey(deps.db, req.params.id) : null;
      const obj = key ? await deps.storage.get(key) : null;
      if (!obj) return reply.code(404).send({ error: "not_found" });
      reply.header("Content-Type", "image/webp").header("X-Content-Type-Options", "nosniff");
      if (obj.contentLength !== undefined) reply.header("Content-Length", obj.contentLength);
      return reply.send(obj.body);
    });

    secured.get<{ Querystring: { limit?: string } }>("/internal/admin/actions", async (req) => {
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 200);
      const rows = await auth.recentActions(limit);
      return {
        items: rows.map((r) => ({
          id: r.id,
          actor: r.actor,
          action: r.action,
          target: r.target,
          created_at: r.createdAt.toISOString(),
        })),
      };
    });
  });
}
