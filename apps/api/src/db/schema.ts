import { sql } from "drizzle-orm";
import {
  bigint,
  date,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { Paint, Part } from "@mw/contract";

// Millisecond precision on purpose: keyset cursors carry JS Dates (ms), and a
// microsecond column would make "(created_at, id) < cursor" skip or repeat rows.
const createdAt = () =>
  timestamp({ withTimezone: true, precision: 3 }).notNull().defaultNow();

export const collectionStatus = pgEnum("collection_status", ["active", "banned"]);
export const miniatureStatus = pgEnum("miniature_status", ["visible", "hidden", "removed"]);
export const faction = pgEnum("faction", ["painted", "gilded"]);
export const hiddenReason = pgEnum("hidden_reason", ["reports", "moderator"]);
export const reportReason = pgEnum("report_reason", ["offensive", "spam", "stolen", "other"]);
export const reportStatus = pgEnum("report_status", ["open", "resolved"]);

export const collections = pgTable("collections", {
  id: varchar({ length: 12 }).primaryKey(),
  ownerName: text(),
  /** From the manifest, unverified; never shown or relied on (spec section 4). */
  claimedSteamId: varchar({ length: 17 }),
  /** Verified Steam ID, phase 1.5. */
  steamId: varchar({ length: 17 }),
  status: collectionStatus().notNull().default("active"),
  /** Phase 1.5: owner opts the collection out of the gallery. */
  hiddenFromGallery: boolean().notNull().default(false),
  createdAt: createdAt(),
});

/**
 * Upload keys, stored only as SHA-256. One key per collection in phase 1;
 * a separate table so phase 1.5 can attach several keys (reinstalls) without a rewrite.
 */
export const collectionKeys = pgTable(
  "collection_keys",
  {
    keyHash: varchar({ length: 64 }).primaryKey(),
    collectionId: varchar({ length: 12 })
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.collectionId)],
);

export type StoredFile = { key: string; bytes: number };
export type StoredImage = StoredFile & { width: number; height: number };
export type MiniatureFiles = {
  glb: StoredFile;
  card: StoredImage;
  thumb400: StoredImage;
  thumb800: StoredImage;
  og: StoredImage;
  /** Private, never served publicly (phase 4 needs it). */
  journal?: StoredFile;
};

export const miniatures = pgTable(
  "miniatures",
  {
    id: varchar({ length: 12 }).primaryKey(),
    collectionId: varchar({ length: 12 })
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    miniatureGuid: uuid().notNull(),
    title: text().notNull(),
    description: text(),
    faction: faction(),
    parts: jsonb().$type<Part[]>().notNull(),
    paints: jsonb().$type<Paint[]>().notNull(),
    strokeCount: integer().notNull(),
    workSeconds: integer().notNull(),
    appraisal: jsonb().$type<unknown>(),
    gameVersion: text().notNull(),
    journalHash: text(),
    atlasSize: integer().notNull(),
    /** Created in the game (manifest miniature.created_at). */
    paintedAt: timestamp({ withTimezone: true, precision: 3 }),
    files: jsonb().$type<MiniatureFiles>().notNull(),
    status: miniatureStatus().notNull().default("visible"),
    /** Why it is hidden: auto-hidden by reports (waits for the moderator) or by the moderator. */
    hiddenReason: hiddenReason(),
    views: bigint({ mode: "number" }).notNull().default(0),
    createdAt: createdAt(),
    updatedAt: createdAt(),
  },
  (t) => [
    // Re-sharing the same miniature from the same collection replaces it.
    uniqueIndex().on(t.collectionId, t.miniatureGuid),
    // Keyset pagination: gallery (all and by faction) and collection pages.
    // Plain ascending indexes on purpose: a backward scan yields exactly
    // "ORDER BY created_at DESC, id DESC" (DESC NULLS FIRST). drizzle's .desc()
    // emits DESC NULLS LAST, which does not match that ORDER BY and forces a sort.
    index("miniatures_gallery_idx")
      .on(t.createdAt, t.id)
      .where(sql`${t.status} = 'visible'`),
    index("miniatures_gallery_faction_idx")
      .on(t.faction, t.createdAt, t.id)
      .where(sql`${t.status} = 'visible'`),
    index("miniatures_collection_idx").on(t.collectionId, t.createdAt, t.id),
    // Title orders (A-Z and Z-A); the expression must match services/miniatures.ts exactly.
    index("miniatures_gallery_title_idx")
      .on(sql`(${t.title} collate "mw_title")`, t.id)
      .where(sql`${t.status} = 'visible'`),
    index("miniatures_gallery_faction_title_idx")
      .on(t.faction, sql`(${t.title} collate "mw_title")`, t.id)
      .where(sql`${t.status} = 'visible'`),
  ],
);

/** Spec section 4 (Report) and 7. The IP is stored only as a salted hash. */
export const reports = pgTable(
  "reports",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    miniatureId: varchar({ length: 12 })
      .notNull()
      .references(() => miniatures.id, { onDelete: "cascade" }),
    reason: reportReason().notNull(),
    text: varchar({ length: 300 }).notNull().default(""),
    ipHash: varchar({ length: 64 }).notNull(),
    status: reportStatus().notNull().default("open"),
    createdAt: createdAt(),
  },
  (t) => [
    // One IP, one open report per miniature (spec section 7).
    uniqueIndex("reports_one_open_per_ip").on(t.miniatureId, t.ipHash).where(sql`${t.status} = 'open'`),
    // Daily limit per IP.
    index("reports_ip_recent_idx").on(t.ipHash, t.createdAt),
    // Moderation queue and notification digests.
    index("reports_created_idx").on(t.createdAt),
  ],
);

/** Small durable key/value state (e.g. when the last moderator email went out). */
export const appState = pgTable("app_state", {
  key: varchar({ length: 64 }).primaryKey(),
  value: jsonb().notNull(),
  updatedAt: createdAt(),
});

/** Admin sessions (spec section 7: 12 hours). Only the SHA-256 of the token is stored. */
export const adminSessions = pgTable("admin_sessions", {
  tokenHash: varchar({ length: 64 }).primaryKey(),
  createdAt: createdAt(),
  expiresAt: timestamp({ withTimezone: true, precision: 3 }).notNull(),
});

/** Log of everything the admin does (spec section 4, AdminAction). */
export const adminActions = pgTable(
  "admin_actions",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    actor: varchar({ length: 64 }).notNull(),
    action: varchar({ length: 64 }).notNull(),
    target: text().notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("admin_actions_created_idx").on(t.createdAt)],
);

/** Per-day counters for the admin statistics (spec section 7), e.g. miniature page views. */
export const dailyStats = pgTable(
  "daily_stats",
  {
    day: date().notNull(),
    metric: varchar({ length: 64 }).notNull(),
    value: bigint({ mode: "number" }).notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.metric] })],
);

export type CollectionRow = typeof collections.$inferSelect;
export type MiniatureRow = typeof miniatures.$inferSelect;
