import { isLang, type Lang } from "./i18n";

export const LANG_COOKIE = "lang";

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

/** Language: explicit choice (cookie) first, then the browser's Accept-Language, then English. */
export function detectLang(request: Request): Lang {
  const fromCookie = readCookie(request.headers.get("Cookie"), LANG_COOKIE);
  if (isLang(fromCookie)) return fromCookie;

  const accept = request.headers.get("Accept-Language") ?? "";
  const ranked = accept
    .split(",")
    .map((part) => {
      const [tag = "", ...params] = part.trim().toLowerCase().split(";");
      const q = Number(params.find((p) => p.trim().startsWith("q="))?.split("=")[1] ?? 1);
      return { base: tag.split("-")[0], q: Number.isFinite(q) ? q : 0 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { base } of ranked) if (isLang(base)) return base;
  return "en";
}

export function langCookie(lang: Lang): string {
  // Technical cookie only (spec section 3): no consent banner needed.
  return `${LANG_COOKIE}=${lang}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
