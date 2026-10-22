import { data, redirect } from "react-router";
import type { Route } from "./+types/miniature-card";
import { fetchMiniature } from "../lib/api.server";

/** /m/<id>/card.png: redirect to the card on the files origin (404 when hidden). */
export async function loader({ params }: Route.LoaderArgs) {
  const result = await fetchMiniature(params.id, { countView: false });
  if (result.kind !== "ok") throw data(null, { status: 404 });
  return redirect(result.item.files.card, { headers: { "Cache-Control": "public, max-age=60" } });
}
