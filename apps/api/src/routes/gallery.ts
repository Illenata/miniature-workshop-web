import type { FastifyInstance } from "fastify";
import { galleryQuerySchema } from "@mw/contract";
import type { AppDeps } from "../app.ts";
import { HttpError } from "../lib/errors.ts";
import { listGallery } from "../services/miniatures.ts";

/** GET /api/v1/gallery?cursor=&faction= (spec section 8). */
export async function galleryRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get("/api/v1/gallery", async (req, reply) => {
    const parsed = galleryQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new HttpError("invalid_request", issue?.message ?? "Invalid query", {
        field: String(issue?.path[0] ?? ""),
      });
    }
    const page = await listGallery(
      deps.db,
      { ...parsed.data, pageSize: deps.config.GALLERY_PAGE_SIZE },
      { publicBaseUrl: deps.config.PUBLIC_BASE_URL, filesBaseUrl: deps.config.FILES_BASE_URL },
    );
    // Short shared cache: new uploads appear within seconds, and a CDN can absorb spikes.
    reply.header("Cache-Control", "public, max-age=15");
    return page;
  });
}
