import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../app.ts";
import { hashIp } from "../lib/ip-hash.ts";
import { AdminAuth } from "../services/admin-auth.ts";

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
