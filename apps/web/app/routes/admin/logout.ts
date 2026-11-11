import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { adminFetch, assertSameOrigin, clearSessionCookie, getAdminSession } from "../../lib/admin.server";

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  const session = await getAdminSession(request);
  if (session) await adminFetch("/logout", { method: "POST", token: session.token });
  return redirect("/admin/login", { headers: { "Set-Cookie": clearSessionCookie() } });
}

export function loader() {
  return redirect("/admin");
}
