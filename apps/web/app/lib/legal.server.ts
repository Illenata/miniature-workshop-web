import { marked } from "marked";
import privacyEn from "../../content/privacy.en.md?raw";
import privacyUk from "../../content/privacy.uk.md?raw";
import termsEn from "../../content/terms.en.md?raw";
import termsUk from "../../content/terms.uk.md?raw";
import type { Lang } from "./i18n";

/**
 * /privacy and /terms are Markdown files in apps/web/content, one per language
 * (spec section 6). To change a text, replace the file and rebuild: the files are
 * bundled into the server build, so nothing is read from disk at run time.
 */
export const LEGAL_DOCS = ["privacy", "terms"] as const;
export type LegalDoc = (typeof LEGAL_DOCS)[number];

const sources: Record<LegalDoc, Record<Lang, string>> = {
  privacy: { en: privacyEn, uk: privacyUk },
  terms: { en: termsEn, uk: termsUk },
};

export type LegalPage = {
  /** Text of the first "# heading": the page title in the browser tab. */
  title: string;
  /** Rendered from our own files, never from user input, so it is safe to insert as HTML. */
  html: string;
};

function render(source: string): LegalPage {
  const tokens = marked.lexer(source);
  const heading = tokens.find((token) => token.type === "heading" && token.depth === 1);
  return {
    title: heading && "text" in heading ? String(heading.text) : "",
    html: marked.parser(tokens),
  };
}

// The texts never change while the server runs: render each once.
const cache = new Map<string, LegalPage>();

export function legalPage(doc: LegalDoc, lang: Lang): LegalPage {
  const key = `${doc}.${lang}`;
  let page = cache.get(key);
  if (!page) {
    page = render(sources[doc][lang]);
    cache.set(key, page);
  }
  return page;
}
