CREATE TABLE "admin_actions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_actions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor" varchar(64) NOT NULL,
	"action" varchar(64) NOT NULL,
	"target" text DEFAULT '' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"token_hash" varchar(64) PRIMARY KEY NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_stats" (
	"day" date NOT NULL,
	"metric" varchar(64) NOT NULL,
	"value" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_stats_day_metric_pk" PRIMARY KEY("day","metric")
);
--> statement-breakpoint
CREATE INDEX "admin_actions_created_idx" ON "admin_actions" USING btree ("created_at");