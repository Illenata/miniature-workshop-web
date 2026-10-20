import { z } from "zod";

/** Length in characters (code points), not UTF-16 units: "🎨" counts as one. */
function chars(min: number, max: number) {
  return z.string().refine(
    (s) => {
      const n = [...s].length;
      return n >= min && n <= max;
    },
    { message: `must be ${min}-${max} characters` },
  );
}

// Control characters are rejected everywhere; descriptions may keep line breaks.
const NO_CONTROL = /^[^\p{Cc}]*$/u;
const NO_CONTROL_EXCEPT_NEWLINES = /^(?:[^\p{Cc}]|\r?\n)*$/u;
const SNAKE_CASE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

export const FACTIONS = ["painted", "gilded"] as const;
export const factionSchema = z.enum(FACTIONS);
export type Faction = z.infer<typeof factionSchema>;

const snakeId = z.string().max(64).regex(SNAKE_CASE, "must be snake_case");

export const partSchema = z.object({
  part_id: snakeId,
  kit_id: snakeId,
  kit_name: chars(1, 64).regex(NO_CONTROL),
});
export type Part = z.infer<typeof partSchema>;

export const paintSchema = z.object({
  paint_id: snakeId,
  name: chars(1, 64).regex(NO_CONTROL),
  rgb: z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be #rrggbb"),
});
export type Paint = z.infer<typeof paintSchema>;

export const APPRAISAL_MAX_BYTES = 8 * 1024;

/** Free-form JSON shown as-is; the server never interprets it. */
export const appraisalSchema = z
  .json()
  .refine((v) => new TextEncoder().encode(JSON.stringify(v)).length <= APPRAISAL_MAX_BYTES, {
    message: `must be at most ${APPRAISAL_MAX_BYTES} bytes of JSON`,
  });

const flakeParams = z.tuple([z.number(), z.number(), z.number(), z.number()]);

/**
 * Manifest, schema 1 (spec appendix A). Unknown fields are stripped, not rejected,
 * so newer game builds can add optional fields without breaking uploads.
 */
export const manifestV1Schema = z.object({
  schema: z.literal(1),
  game: z.object({
    version: chars(1, 32),
    build: chars(1, 32),
    platform: chars(1, 32),
  }),
  claimed_steam_id: z.string().regex(/^\d{17}$/).nullish(),
  owner_name: chars(1, 32).regex(NO_CONTROL).nullish(),
  miniature: z.object({
    guid: z.uuid(),
    title: chars(1, 60).regex(NO_CONTROL),
    description: chars(0, 500).regex(NO_CONTROL_EXCEPT_NEWLINES).nullish(),
    faction: factionSchema.nullish(),
    parts: z.array(partSchema).min(1).max(64),
    paints: z.array(paintSchema).max(64).default([]),
    stroke_count: z.int().min(0),
    work_seconds: z.int().min(0),
    appraisal: appraisalSchema.nullish(),
    atlas_size: z.int().min(64).max(4096),
    journal_hash: z
      .string()
      .regex(/^sha256:[0-9a-f]{64}$/, "must be sha256:<64 hex>")
      .nullish(),
    created_at: z.iso.datetime(),
  }),
  render: z
    .object({
      flakes: flakeParams.optional(),
      flakes2: flakeParams.optional(),
    })
    .nullish(),
});

export type ManifestV1 = z.infer<typeof manifestV1Schema>;

/**
 * The server accepts the current schema and the previous one (spec section 2).
 * Only schema 1 exists so far; add the next version here as a union member.
 */
export const manifestSchema = manifestV1Schema;
export type Manifest = ManifestV1;
