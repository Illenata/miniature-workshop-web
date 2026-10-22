import type { FastifyInstance } from "fastify";
import { isPublicId } from "@mw/contract";
import type { AppDeps } from "../app.ts";
import { TtlCache } from "../lib/ttl-cache.ts";
import { isServable } from "../services/miniatures.ts";
import { CONTENT_TYPES } from "../storage/storage.ts";

// Only these types are ever served (spec section 3). Journals (.bin) never match.
const SERVABLE = /^([0-9a-f]{64})\.(glb|png|webp)$/;

/**
 * User files, served from their own origin (files.<domain> in production) and never as HTML.
 * Paths are content-addressed, so responses are immutable. Hidden or banned miniatures stop
 * being served within VISIBILITY_TTL_MS (the spec allows "within a minute").
 */
export const VISIBILITY_TTL_MS = 30_000;

export async function filesRoutes(app: FastifyInstance, deps: AppDeps) {
  const visibility = new TtlCache<boolean>(VISIBILITY_TTL_MS, 20_000);

  // CORS preflight: plain GETs from model-viewer need none, but a browser extension or a
  // client adding headers would otherwise get the model blocked.
  app.options("/files/collections/:cid/:mid/:name", async (_req, reply) =>
    reply
      .code(204)
      .header("Access-Control-Allow-Origin", "*")
      .header("Access-Control-Allow-Methods", "GET, HEAD")
      .header("Access-Control-Allow-Headers", "*")
      .header("Access-Control-Max-Age", "86400")
      .send(),
  );

  app.get<{ Params: { cid: string; mid: string; name: string } }>(
    "/files/collections/:cid/:mid/:name",
    async (req, reply) => {
      const { cid, mid, name } = req.params;
      const match = SERVABLE.exec(name);
      if (!match || !isPublicId(cid) || !isPublicId(mid)) return notFound(reply);
      const ext = match[2] as "glb" | "png" | "webp";

      const cacheKey = `${cid}/${mid}`;
      let servable = visibility.get(cacheKey);
      if (servable === undefined) {
        servable = await isServable(deps.db, cid, mid);
        visibility.set(cacheKey, servable);
      }
      if (!servable) return notFound(reply);

      const obj = await deps.storage.get(`collections/${cid}/${mid}/${name}`);
      if (!obj) return notFound(reply);

      reply
        .header("Content-Type", CONTENT_TYPES[ext])
        .header("X-Content-Type-Options", "nosniff")
        .header("Cache-Control", "public, max-age=31536000, immutable")
        .header("Content-Security-Policy", "default-src 'none'; sandbox")
        .header("Cross-Origin-Resource-Policy", "cross-origin")
        // model-viewer fetches the glb with CORS from the pages origin.
        .header("Access-Control-Allow-Origin", "*")
        .header(
          "Content-Disposition",
          ext === "glb" ? `attachment; filename="${mid}.glb"` : "inline",
        );
      if (obj.contentLength !== undefined) reply.header("Content-Length", obj.contentLength);
      return reply.send(obj.body);
    },
  );
}

function notFound(reply: import("fastify").FastifyReply) {
  return reply
    .code(404)
    .header("Cache-Control", "public, max-age=60")
    .header("X-Content-Type-Options", "nosniff")
    .send({ error: "not_found", message: "File not found", field: "" });
}
