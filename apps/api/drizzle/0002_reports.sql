CREATE TYPE "public"."hidden_reason" AS ENUM('reports', 'moderator');--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('offensive', 'spam', 'stolen', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TABLE "app_state" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"miniature_id" varchar(12) NOT NULL,
	"reason" "report_reason" NOT NULL,
	"text" varchar(300) DEFAULT '' NOT NULL,
	"ip_hash" varchar(64) NOT NULL,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "miniatures" ADD COLUMN "hidden_reason" "hidden_reason";--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_miniature_id_miniatures_id_fk" FOREIGN KEY ("miniature_id") REFERENCES "public"."miniatures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reports_one_open_per_ip" ON "reports" USING btree ("miniature_id","ip_hash") WHERE "reports"."status" = 'open';--> statement-breakpoint
CREATE INDEX "reports_ip_recent_idx" ON "reports" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "reports_created_idx" ON "reports" USING btree ("created_at");