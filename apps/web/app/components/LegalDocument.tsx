import { isLang, translate } from "../lib/i18n";
import type { LegalPage } from "../lib/legal.server";

type LegalMetaArgs = {
  data: { page: LegalPage } | undefined;
  matches: readonly ({ data?: unknown } | undefined)[];
};

/** Shared by /privacy and /terms: the tab title comes from the document's first heading. */
export function legalMeta({ data, matches }: LegalMetaArgs) {
  const rootLang = (matches[0]?.data as { lang?: unknown } | undefined)?.lang;
  const lang = isLang(rootLang) ? rootLang : "en";
  const title = data?.page.title ?? "";
  return [{ title: translate(lang, "legal.metaTitle", { title }) }];
}

export function LegalDocument({ page }: { page: LegalPage }) {
  return (
    <article
      className="doc mx-auto max-w-2xl px-4 pb-16 pt-8"
      // Our own Markdown from apps/web/content, rendered on the server.
      dangerouslySetInnerHTML={{ __html: page.html }}
    />
  );
}
