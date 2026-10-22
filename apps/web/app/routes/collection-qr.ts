import QRCode from "qrcode";
import { data } from "react-router";
import type { Route } from "./+types/collection-qr";
import { fetchCollectionPage } from "../lib/api.server";
import { TtlCache } from "../lib/ttl-cache";

const cache = new TtlCache<Buffer>(60 * 60_000, 500);

/** /c/<id>/qr.png: 512×512 QR with the collection's link (spec section 6); 404 if missing or banned. */
export async function loader({ params }: Route.LoaderArgs) {
  const result = await fetchCollectionPage(params.id, { lang: "en" });
  if (result.kind !== "ok") throw data(null, { status: 404 });

  const url = result.collection.url;
  let png = cache.get(url);
  if (!png) {
    png = await QRCode.toBuffer(url, { type: "png", width: 512, margin: 2, errorCorrectionLevel: "M" });
    cache.set(url, png);
  }
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(png.length),
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
