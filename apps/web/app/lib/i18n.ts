import { useRouteLoaderData } from "react-router";
import en from "../i18n/en.json";
import uk from "../i18n/uk.json";

/**
 * UI strings live in one JSON file per language (spec section 3). English is the
 * reference: a key missing from another language falls back to English.
 * User texts (titles, descriptions) are never translated.
 */
export const LANGS = ["en", "uk"] as const;
export type Lang = (typeof LANGS)[number];
export type MessageKey = keyof typeof en;

const dictionaries: Record<Lang, Partial<Record<MessageKey, string>>> = { en, uk };

export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && (LANGS as readonly string[]).includes(value);
}

export function translate(lang: Lang, key: MessageKey, vars?: Record<string, string | number>): string {
  const template = dictionaries[lang][key] ?? en[key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) =>
    name in vars ? String(vars[name]) : m,
  );
}

export function useLang(): Lang {
  const data = useRouteLoaderData("root") as { lang?: Lang } | undefined;
  return data?.lang ?? "en";
}

export function useT() {
  const lang = useLang();
  return (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
}
