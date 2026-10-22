import { data, redirect } from "react-router";
import type { Route } from "./+types/miniature-glb";
import { fetchMiniature } from "../lib/api.server";

/** /m/<id>/model.glb: redirect to the file on the files origin (404 when hidden). */
export async function loader({ params }: Route.LoaderArgs) {
  const result = await fetchMiniature(params.id, { countView: false });
  if (result.kind !== "ok") throw data(null, { status: 404 });
  return redirect(result.item.files.glb, { headers: { "Cache-Control": "public, max-age=60" } });
}
