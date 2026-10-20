import { describe, expect, it } from "vitest";
import en from "../app/i18n/en.json";
import uk from "../app/i18n/uk.json";
import { translate } from "../app/lib/i18n";

describe("UI strings", () => {
  it("uk has exactly the same keys as en", () => {
    expect(Object.keys(uk).sort()).toEqual(Object.keys(en).sort());
  });

  it("keeps the same {placeholders} in every language", () => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(vars(uk[key]), key).toEqual(vars(en[key]));
    }
  });

  it("interpolates and falls back to English", () => {
    expect(translate("uk", "workshop.named", { name: "Taras" })).toBe("Майстерня Taras");
    expect(translate("en", "workshop.anonymous", { id: "7k3m9q2vx4ht" })).toBe("Workshop #7k3m9q2vx4ht");
  });
});
