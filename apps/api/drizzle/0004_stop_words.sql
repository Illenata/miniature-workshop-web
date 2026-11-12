CREATE TYPE "public"."stop_word_match" AS ENUM('word', 'substring');--> statement-breakpoint
CREATE TABLE "stop_words" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stop_words_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"word" varchar(64) NOT NULL,
	"normalized" varchar(256) NOT NULL,
	"match" "stop_word_match" DEFAULT 'word' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stop_words_normalized_unique" UNIQUE("normalized")
);
