CREATE TYPE "public"."collection_status" AS ENUM('active', 'banned');--> statement-breakpoint
CREATE TYPE "public"."faction" AS ENUM('painted', 'gilded');--> statement-breakpoint
CREATE TYPE "public"."miniature_status" AS ENUM('visible', 'hidden', 'removed');--> statement-breakpoint
CREATE TABLE "collection_keys" (
	"key_hash" varchar(64) PRIMARY KEY NOT NULL,
	"collection_id" varchar(12) NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" varchar(12) PRIMARY KEY NOT NULL,
	"owner_name" text,
	"claimed_steam_id" varchar(17),
	"steam_id" varchar(17),
	"status" "collection_status" DEFAULT 'active' NOT NULL,
	"hidden_from_gallery" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "miniatures" (
	"id" varchar(12) PRIMARY KEY NOT NULL,
	"collection_id" varchar(12) NOT NULL,
	"miniature_guid" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"faction" "faction",
	"parts" jsonb NOT NULL,
	"paints" jsonb NOT NULL,
	"stroke_count" integer NOT NULL,
	"work_seconds" integer NOT NULL,
	"appraisal" jsonb,
	"game_version" text NOT NULL,
	"journal_hash" text,
	"atlas_size" integer NOT NULL,
	"painted_at" timestamp (3) with time zone,
	"files" jsonb NOT NULL,
	"status" "miniature_status" DEFAULT 'visible' NOT NULL,
	"views" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collection_keys" ADD CONSTRAINT "collection_keys_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "miniatures" ADD CONSTRAINT "miniatures_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collection_keys_collection_id_index" ON "collection_keys" USING btree ("collection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "miniatures_collection_id_miniature_guid_index" ON "miniatures" USING btree ("collection_id","miniature_guid");--> statement-breakpoint
CREATE INDEX "miniatures_gallery_idx" ON "miniatures" USING btree ("created_at","id") WHERE "miniatures"."status" = 'visible';--> statement-breakpoint
CREATE INDEX "miniatures_gallery_faction_idx" ON "miniatures" USING btree ("faction","created_at","id") WHERE "miniatures"."status" = 'visible';--> statement-breakpoint
CREATE INDEX "miniatures_collection_idx" ON "miniatures" USING btree ("collection_id","created_at","id");