import { describe, expect, it } from "vitest";
import { detectLang } from "../app/lib/i18n.server";

const req = (headers: Record<string, string>) => new Request("http://x/", { headers });

describe("detectLang", () => {
  it("prefers the cookie", () => {
    expect(detectLang(req({ Cookie: "a=1; lang=uk", "Accept-Language": "en" }))).toBe("uk");
  });
  it("uses Accept-Language by quality", () => {
    expect(detectLang(req({ "Accept-Language": "de;q=0.9, uk-UA;q=0.8, en;q=0.5" }))).toBe("uk");
    expect(detectLang(req({ "Accept-Language": "fr-FR" }))).toBe("en");
  });
  it("ignores unknown cookie values", () => {
    expect(detectLang(req({ Cookie: "lang=xx" }))).toBe("en");
  });
});
