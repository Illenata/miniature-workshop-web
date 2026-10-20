import { redirect } from "react-router";
import type { Route } from "./+types/lang";
import { isLang } from "../lib/i18n";
import { langCookie } from "../lib/i18n.server";

/** Only same-site paths: never redirect to another origin ("//evil.com", "/\\evil.com"). */
function safePath(value: FormDataEntryValue | null): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/";
  }
  return value;
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const lang = form.get("lang");
  const to = safePath(form.get("redirectTo"));
  if (!isLang(lang)) return redirect(to);
  return redirect(to, { headers: { "Set-Cookie": langCookie(lang) } });
}

export function loader() {
  return redirect("/");
}
