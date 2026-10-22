import Fastify, { type FastifyServerOptions } from "fastify";
import type { Config } from "./config.ts";
import type { Db } from "./db/client.ts";
import { HttpError } from "./lib/errors.ts";
import { collectionRoutes } from "./routes/collections.ts";
import { filesRoutes } from "./routes/files.ts";
import { galleryRoutes } from "./routes/gallery.ts";
import { healthRoutes } from "./routes/health.ts";
import { miniatureRoutes } from "./routes/miniatures.ts";
import { reportRoutes } from "./routes/reports.ts";
import type { ModeratorNotifier } from "./services/notifier.ts";
import type { Storage } from "./storage/storage.ts";

export type AppDeps = { config: Config; db: Db; storage: Storage; notifier: ModeratorNotifier };

/**
 * Logs are JSON without personal data (spec section 3): requests are logged by
 * method, route and status only; no IPs, hostnames, user agents or Authorization.
 */
function loggerOptions(config: Config): FastifyServerOptions["logger"] {
  if (config.NODE_ENV === "test") return false;
  return {
    level: config.LOG_LEVEL,
    redact: ["req.headers.authorization"],
    serializers: {
      req: (req) => ({ method: req.method, url: req.routeOptions?.url ?? "unmatched" }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  };
}

export async function buildApp(deps: AppDeps) {
  const app = Fastify({
    logger: loggerOptions(deps.config),
    // Only the reverse proxy and the page server (private networks) may set X-Forwarded-For.
    trustProxy: deps.config.TRUST_PROXY.split(",").map((s) => s.trim()).filter(Boolean),
    // Spec section 5: server-side request timeout 120 s.
    requestTimeout: 120_000,
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      if (err.retryAfter !== undefined) reply.header("Retry-After", err.retryAfter);
      return reply.code(err.status).send(err.toBody());
    }
    const { statusCode: status, message } = err as { statusCode?: number; message?: string };
    if (status && status >= 400 && status < 500) {
      // Fastify's own errors: malformed JSON, body too large, unsupported media type…
      return reply.code(status).send({
        error: status === 404 ? "not_found" : status === 413 ? "too_large" : "invalid_request",
        message: message ?? "Bad request",
        field: "",
      });
    }
    req.log.error({ err }, "unhandled error");
    return reply.code(500).send({ error: "internal", message: "Internal server error", field: "" });
  });

  app.setNotFoundHandler((_req, reply) =>
    reply.code(404).send({ error: "not_found", message: "Route not found", field: "" }),
  );

  await app.register(healthRoutes, deps);
  await app.register(galleryRoutes, deps);
  await app.register(miniatureRoutes, deps);
  await app.register(collectionRoutes, deps);
  await app.register(reportRoutes, deps);
  await app.register(filesRoutes, deps);

  return app;
}
