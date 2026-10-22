import type { FastifyInstance } from "fastify";
import { isPublicId, MINIATURE_HIDDEN_MESSAGE } from "@mw/contract";
import type { AppDeps } from "../app.ts";
import { HttpError } from "../lib/errors.ts";
import { getMiniature } from "../services/miniatures.ts";

/**
 * Header the page server sends when a person opens /m/<id>, so the view counter
 * counts page loads only (not API reads by the companion app or link-preview bots).
 * Internal, not part of the public contract.
 */
export const PAGE_VIEW_HEADER = "x-mw-page-view";

/** GET /api/v1/miniatures/{id} (spec section 8). 404 for missing, hidden or removed. */
export async function miniatureRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get<{ Params: { id: string } }>("/api/v1/miniatures/:id", async (req, reply) => {
    const { id } = req.params;
    if (!isPublicId(id)) throw new HttpError("not_found", "Miniature not found");

    const countView = req.headers[PAGE_VIEW_HEADER] === "1";
    const result = await getMiniature(
      deps.db,
      id,
      { publicBaseUrl: deps.config.PUBLIC_BASE_URL, filesBaseUrl: deps.config.FILES_BASE_URL },
      { countView },
    );
    if (result.kind === "missing") throw new HttpError("not_found", "Miniature not found");
    if (result.kind === "hidden") throw new HttpError("not_found", MINIATURE_HIDDEN_MESSAGE);

    reply.header("Cache-Control", countView ? "no-store" : "public, max-age=15");
    return result.item;
  });
}
