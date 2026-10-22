import { describe, expect, it } from "vitest";
import { isPublicId, manifestSchema, PUBLIC_ID_ALPHABET } from "../src/index.ts";
import { reportRequestSchema } from "../src/index.ts";

// The example from spec appendix A.
const example = {
  schema: 1,
  game: { version: "0.6.0", build: "2026-12-01", platform: "windows" },
  claimed_steam_id: null,
  owner_name: "Taras",
  miniature: {
    guid: "3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90",
    title: "Лучник степу",
    description: "Перша спроба металіку на наконечнику.",
    faction: "painted",
    parts: [
      { part_id: "bowmen_head_faceless_01", kit_id: "kit_bowmen", kit_name: "Bowmen" },
      { part_id: "bowmen_torso_shirt_02", kit_id: "kit_bowmen", kit_name: "Bowmen" },
    ],
    paints: [{ paint_id: "paint_cobalt_blue", name: "Cobalt Blue", rgb: "#1f4fb0" }],
    stroke_count: 412,
    work_seconds: 1830,
    appraisal: { showpiece: true, profile: { poise: 3, reach: 2 } },
    atlas_size: 2048,
    journal_hash: "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    created_at: "2026-12-01T19:12:00Z",
  },
  render: { flakes: [0.0025, 0.2, 0.025, 0.6], flakes2: [1.5, 0.3, 6, 0] },
};

function withMiniature(patch: Record<string, unknown>) {
  return { ...example, miniature: { ...example.miniature, ...patch } };
}

describe("manifest schema 1", () => {
  it("accepts the spec example", () => {
    expect(manifestSchema.safeParse(example).success).toBe(true);
  });

  it("ignores unknown fields instead of rejecting them", () => {
    const parsed = manifestSchema.parse({ ...example, future_field: 1 });
    expect(parsed).not.toHaveProperty("future_field");
  });

  it("names the missing field", () => {
    const { title: _omit, ...miniature } = example.miniature;
    const result = manifestSchema.safeParse({ ...example, miniature });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["miniature", "title"]);
  });

  it("counts title length in characters, not UTF-16 units", () => {
    expect(manifestSchema.safeParse(withMiniature({ title: "🎨".repeat(60) })).success).toBe(true);
    expect(manifestSchema.safeParse(withMiniature({ title: "🎨".repeat(61) })).success).toBe(false);
  });

  it("allows line breaks only in description", () => {
    expect(manifestSchema.safeParse(withMiniature({ description: "a\nb" })).success).toBe(true);
    expect(manifestSchema.safeParse(withMiniature({ title: "a\nb" })).success).toBe(false);
  });

  it("rejects unknown factions and bad colours", () => {
    expect(manifestSchema.safeParse(withMiniature({ faction: "orcs" })).success).toBe(false);
    expect(
      manifestSchema.safeParse(
        withMiniature({ paints: [{ paint_id: "p", name: "P", rgb: "blue" }] }),
      ).success,
    ).toBe(false);
  });

  it("accepts null faction", () => {
    expect(manifestSchema.safeParse(withMiniature({ faction: null })).success).toBe(true);
  });
});

describe("public ids", () => {
  it("alphabet is Crockford base32 without i, l, o, u", () => {
    expect(PUBLIC_ID_ALPHABET).toHaveLength(32);
    expect(PUBLIC_ID_ALPHABET).not.toMatch(/[ilou]/);
  });

  it("validates the spec examples", () => {
    expect(isPublicId("7k3m9q2vx4ht")).toBe(true);
    expect(isPublicId("b8nq2w5r7ycd")).toBe(true);
    expect(isPublicId("b8nq2w5r7yco")).toBe(false);
    expect(isPublicId("B8NQ2W5R7YCD")).toBe(false);
    expect(isPublicId("b8nq2w5r7yc")).toBe(false);
  });
});


describe("report request", () => {
  const base = { miniature_id: "b8nq2w5r7ycd", reason: "spam" };
  it("accepts a reason without text", () => {
    expect(reportRequestSchema.parse(base)).toEqual({ ...base, text: "" });
  });
  it("limits text to 300 characters and rejects unknown reasons", () => {
    expect(reportRequestSchema.safeParse({ ...base, text: "я".repeat(300) }).success).toBe(true);
    expect(reportRequestSchema.safeParse({ ...base, text: "я".repeat(301) }).success).toBe(false);
    expect(reportRequestSchema.safeParse({ ...base, reason: "ugly" }).success).toBe(false);
  });
});
