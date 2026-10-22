-- Title order for the gallery (A-Z, Z-A): Ukrainian letter order, Latin before Cyrillic,
-- case-insensitive at first level. Needs PostgreSQL built with ICU (official images are).
CREATE COLLATION IF NOT EXISTS "mw_title" (provider = icu, locale = 'uk-u-kr-latn-cyrl');--> statement-breakpoint
CREATE INDEX "miniatures_gallery_title_idx" ON "miniatures" USING btree (("title" collate "mw_title"),"id") WHERE "miniatures"."status" = 'visible';--> statement-breakpoint
CREATE INDEX "miniatures_gallery_faction_title_idx" ON "miniatures" USING btree ("faction",("title" collate "mw_title"),"id") WHERE "miniatures"."status" = 'visible';