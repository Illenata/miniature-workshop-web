import type { FastifyInstance } from "fastify";
import { collectionQuerySchema, isPublicId } from "@mw/contract";
import type { AppDeps } from "../app.ts";
import { HttpError } from "../lib/errors.ts";
import { getCollectionPage } from "../services/miniatures.ts";

/**
 * GET /api/v1/collections/{id}?cursor= (spec section 8): the collection's visible
 * miniatures, newest first, as `{ items, next_cursor }`, plus `collection` (name and
 * count) for the page header. 404 for missing or banned collections.
 */
export async function collectionRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get<{ Params: { id: string } }>("/api/v1/collections/:id", async (req, reply) => {
    if (!isPublicId(req.params.id)) throw new HttpError("not_found", "Collection not found");
    const parsed = collectionQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new HttpError("invalid_request", issue?.message ?? "Invalid query", {
        field: String(issue?.path[0] ?? ""),
      });
    }
    const result = await getCollectionPage(
      deps.db,
      req.params.id,
      { ...parsed.data, pageSize: deps.config.GALLERY_PAGE_SIZE },
      { publicBaseUrl: deps.config.PUBLIC_BASE_URL, filesBaseUrl: deps.config.FILES_BASE_URL },
    );
    if (result.kind === "missing") throw new HttpError("not_found", "Collection not found");
    reply.header("Cache-Control", "public, max-age=15");
    return { ...result.page, collection: result.collection };
  });
}
