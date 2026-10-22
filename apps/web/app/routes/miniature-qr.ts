import QRCode from "qrcode";
import { data } from "react-router";
import type { Route } from "./+types/miniature-qr";
import { fetchMiniature } from "../lib/api.server";
import { TtlCache } from "../lib/ttl-cache";

// QR codes never change for a given URL; keep recent ones in memory (spec section 6: "cached").
const cache = new TtlCache<Buffer>(60 * 60_000, 500);

/** /m/<id>/qr.png: 512×512 QR with the miniature's link; 404 for hidden or missing ones. */
export async function loader({ params }: Route.LoaderArgs) {
  const result = await fetchMiniature(params.id, { countView: false });
  if (result.kind !== "ok") throw data(null, { status: 404 });

  let png = cache.get(result.item.url);
  if (!png) {
    png = await QRCode.toBuffer(result.item.url, {
      type: "png",
      width: 512,
      margin: 2,
      errorCorrectionLevel: "M",
    });
    cache.set(result.item.url, png);
  }
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(png.length),
      // Short enough that hiding a miniature takes effect within minutes.
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
