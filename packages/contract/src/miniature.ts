import { z } from "zod";
import { publicIdSchema } from "./ids.ts";
import { factionSchema, paintSchema, partSchema } from "./manifest.ts";

/**
 * One miniature as the public API returns it (spec section 8). The same shape is
 * used for gallery and collection items and for GET /api/v1/miniatures/{id}.
 * All URLs are absolute; dates are ISO 8601 UTC.
 */
export const miniatureItemSchema = z.object({
  id: publicIdSchema,
  url: z.url(),
  title: z.string(),
  description: z.string().nullable(),
  faction: factionSchema.nullable(),
  owner: z.object({
    collection_id: publicIdSchema,
    /** Raw owner_name from the manifest; null means the page shows "Workshop #<id>". */
    name: z.string().nullable(),
  }),
  parts: z.array(partSchema),
  paints: z.array(paintSchema),
  stroke_count: z.int(),
  work_seconds: z.int(),
  appraisal: z.json().nullable(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  views: z.int(),
  files: z.object({
    glb: z.url(),
    card: z.url(),
    thumb_400: z.url(),
    thumb_800: z.url(),
    og: z.url(),
  }),
});
export type MiniatureItem = z.infer<typeof miniatureItemSchema>;

export const miniatureListSchema = z.object({
  items: z.array(miniatureItemSchema),
  /** Opaque; pass back as ?cursor= to get the next page. null on the last page. */
  next_cursor: z.string().nullable(),
});
export type MiniatureList = z.infer<typeof miniatureListSchema>;

/** Query of GET /api/v1/gallery. No faction means "all". */
export const galleryQuerySchema = z.object({
  cursor: z.string().max(256).optional(),
  faction: factionSchema.optional(),
});
export type GalleryQuery = z.infer<typeof galleryQuerySchema>;
