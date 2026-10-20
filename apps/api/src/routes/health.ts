import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../app.ts";

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms} ms`)), ms)),
  ]);
}

/** GET /healthz: 200 when the server, the database and the storage all answer; 503 otherwise. */
export async function healthRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get("/healthz", async (req, reply) => {
    const [db, storage] = await Promise.allSettled([
      withTimeout(deps.db.execute(sql`select 1`), 2000),
      withTimeout(deps.storage.ping(), 2000),
    ]);
    const ok = db.status === "fulfilled" && storage.status === "fulfilled";
    if (!ok) {
      req.log.warn(
        {
          db: db.status === "rejected" ? String(db.reason) : "ok",
          storage: storage.status === "rejected" ? String(storage.reason) : "ok",
        },
        "health check failed",
      );
    }
    reply.header("Cache-Control", "no-store");
    return reply.code(ok ? 200 : 503).send({
      status: ok ? "ok" : "unavailable",
      db: db.status === "fulfilled" ? "ok" : "down",
      storage: storage.status === "fulfilled" ? "ok" : "down",
    });
  });
}
