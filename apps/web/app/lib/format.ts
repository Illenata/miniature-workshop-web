import type { Lang } from "./i18n";

const LOCALES: Record<Lang, string> = { en: "en-GB", uk: "uk-UA" };

/**
 * "20 Oct 2026" / "20 жовт. 2026". Formatted on the server only and sent as text:
 * Node and browsers ship different ICU data, so formatting the same date on both sides
 * can differ by a character and break hydration. Dates are shown in UTC (the server
 * cannot know the viewer's time zone); day precision makes that acceptable.
 */
export function formatDate(lang: Lang, iso: string): string {
  const text = new Intl.DateTimeFormat(LOCALES[lang], {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
  // Ukrainian appends "р." after the year; too long for a tile.
  return text.replace(/\s*р\.$/, "");
}

/** Work time as h:mm (spec section 6). */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function formatNumber(lang: Lang, n: number): string {
  return new Intl.NumberFormat(LOCALES[lang]).format(n);
}

/** Plural category for message keys like "views.one" / "views.few" / "views.many" / "views.other". */
export function pluralCategory(lang: Lang, n: number): Intl.LDMLPluralRule {
  return new Intl.PluralRules(LOCALES[lang]).select(n);
}
