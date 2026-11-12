import { describe, expect, it } from "vitest";
import { LANGS } from "../app/lib/i18n";
import { LEGAL_DOCS, legalPage } from "../app/lib/legal.server";

describe("privacy and terms pages", () => {
  it("every document exists in every language with a title and a body", () => {
    for (const doc of LEGAL_DOCS) {
      for (const lang of LANGS) {
        const page = legalPage(doc, lang);

        expect(page.title, `${doc}.${lang}`).not.toBe("");
        expect(page.html, `${doc}.${lang}`).toContain(`<h1>${page.title}</h1>`);
        expect(page.html.match(/<h2>/g)?.length ?? 0, `${doc}.${lang}`).toBeGreaterThan(1);
      }
    }
  });

  it("translations keep the same structure", () => {
    const shape = (html: string) => (html.match(/<(h[1-3]|ul|ol|li)>/g) ?? []).join("");

    for (const doc of LEGAL_DOCS) {
      expect(shape(legalPage(doc, "uk").html), doc).toBe(shape(legalPage(doc, "en").html));
    }
  });
});
