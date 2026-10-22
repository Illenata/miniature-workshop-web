import { describe, expect, it } from "vitest";
import { flattenAppraisal, partLabel } from "../app/components/MiniatureSpecs";
import { formatDate, formatDuration, pluralCategory } from "../app/lib/format";

describe("miniature details", () => {
  it("drops the kit prefix from part ids", () => {
    expect(partLabel("bowmen_head_faceless_01", "kit_bowmen")).toBe("head faceless 01");
    expect(partLabel("other_part", "kit_bowmen")).toBe("other part");
  });

  it("shows appraisal as flat key: value pairs", () => {
    expect(flattenAppraisal({ showpiece: true, profile: { poise: 3, reach: 2 } })).toEqual([
      ["showpiece", "true"],
      ["profile.poise", "3"],
      ["profile.reach", "2"],
    ]);
    expect(flattenAppraisal(null)).toEqual([]);
  });

  it("formats work time as h:mm", () => {
    expect(formatDuration(1830)).toBe("0:30");
    expect(formatDuration(4 * 3600 + 5 * 60 + 59)).toBe("4:05");
  });

  it("formats dates in UTC without the Ukrainian year suffix", () => {
    expect(formatDate("uk", "2026-10-20T23:30:00Z")).toBe("20 жовт. 2026");
    expect(formatDate("en", "2026-10-20T23:30:00Z")).toBe("20 Oct 2026");
  });

  it("uses Ukrainian plural categories for view counts", () => {
    expect([1, 2, 5, 11, 21, 22].map((n) => pluralCategory("uk", n))).toEqual(["one", "few", "many", "many", "one", "few"]);
  });
});
