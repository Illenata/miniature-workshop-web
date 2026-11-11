import type { Route } from "./+types/miniature-thumb";
import { adminFetch, requireAdmin } from "../../lib/admin.server";

/**
 * Preview for the admin list. Goes through the admin session instead of the public files
 * origin, because hidden miniatures are not served there.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const session = await requireAdmin(request);
  const res = await adminFetch(`/miniatures/${encodeURIComponent(params.id)}/thumb`, { token: session.token });
  if (!res.ok || !res.body) return new Response(null, { status: 404 });
  return new Response(res.body, {
    headers: {
      "Content-Type": "image/webp",
      "X-Content-Type-Options": "nosniff",
      // Private: only this admin's browser may keep it.
      "Cache-Control": "private, max-age=600",
    },
  });
}
