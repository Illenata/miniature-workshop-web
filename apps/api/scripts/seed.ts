/**
 * Fills the database and storage with placeholder miniatures for local development
 * and for the "first page < 300 ms with 1000 miniatures" acceptance check.
 *
 *   npm run seed                    # 1000 miniatures
 *   npm run seed -- --count 200
 *   npm run seed -- --reset         # wipe miniatures, collections and their files first
 *   npm run seed -- --glb D:/samples/miniature.glb   # use a real model instead of the placeholder
 *
 * Files go through the same derivatives module as real uploads.
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { sql } from "drizzle-orm";
import type { Faction, Paint, Part } from "@mw/contract";
import { loadConfig } from "../src/config.ts";
import { createDb, runMigrations } from "../src/db/client.ts";
import { collections, miniatures, type MiniatureFiles } from "../src/db/schema.ts";
import { newPublicId } from "../src/lib/ids.ts";
import { deriveFromCard } from "../src/media/derivatives.ts";
import { objectKey, Storage, type FileExt } from "../src/storage/storage.ts";
import { placeholderCard, placeholderGlb } from "./placeholders.ts";

const { values: args } = parseArgs({
  options: {
    count: { type: "string", default: "1000" },
    designs: { type: "string", default: "24" },
    reset: { type: "boolean", default: false },
    glb: { type: "string" },
  },
});
const COUNT = Number(args.count);
const DESIGNS = Number(args.designs);
if (!Number.isInteger(COUNT) || COUNT < 1) throw new Error("--count must be a positive integer");

const config = loadConfig();
const { db, sql: pg } = createDb(config.DATABASE_URL);
const storage = new Storage(config);

// Deterministic pseudo-random so two seeds of the same size look alike.
let state = 0x2f6e2b1;
function rand() {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return ((state >>> 0) % 1_000_000) / 1_000_000;
}
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

const ADJECTIVES = ["Steppe", "Iron", "Gilded", "Ash", "Crimson", "Quiet", "Old", "Northern", "Salt", "Amber", "Broken", "Hollow"];
const NOUNS = ["Archer", "Sentinel", "Herald", "Pikeman", "Scout", "Warden", "Banner Bearer", "Duelist", "Monk", "Sapper", "Rider", "Captain"];
// Some Ukrainian titles, so title sorting is exercised across Latin and Cyrillic.
const UK_TITLES = ["Лучник степу", "Залізний вартовий", "Ґрафський герольд", "Єгер", "Їжак-розвідник", "Іскра", "арбалетник", "Вартовий"];
const OWNERS = ["Taras", "Olena", "mini_dad", "BrushGoblin", "Kateryna", "SlowPainter", "Yurii", "PaintPotato", "Marta", null];
const KITS = [
  { id: "kit_bowmen", name: "Bowmen" },
  { id: "kit_spears", name: "Spearmen" },
  { id: "kit_command", name: "Command Group" },
];
const PAINTS: Paint[] = [
  { paint_id: "paint_cobalt_blue", name: "Cobalt Blue", rgb: "#1f4fb0" },
  { paint_id: "paint_bone_white", name: "Bone White", rgb: "#e3d9c0" },
  { paint_id: "paint_rust_red", name: "Rust Red", rgb: "#8e3b25" },
  { paint_id: "paint_old_gold", name: "Old Gold", rgb: "#b8912f" },
  { paint_id: "paint_leather_brown", name: "Leather Brown", rgb: "#6b4a2b" },
  { paint_id: "paint_moss_green", name: "Moss Green", rgb: "#4d6b35" },
  { paint_id: "paint_gunmetal", name: "Gunmetal", rgb: "#4a4f55" },
];
const DESCRIPTIONS = [
  "First try at metallics on the arrowheads.",
  "Перша спроба металіку на наконечнику.",
  "Wet blending on the cloak took forever.",
  null,
  null,
];

function factionFor(): Faction | null {
  const r = rand();
  if (r < 0.1) return null;
  return r < 0.55 ? "painted" : "gilded";
}

async function resetAll() {
  console.log("Reset: deleting seeded rows and files…");
  await db.execute(sql`truncate ${miniatures}, ${collections} cascade`);
  let token: string | undefined;
  let deleted = 0;
  do {
    const res = await storage.client.send(
      new ListObjectsV2Command({ Bucket: storage.bucket, Prefix: "collections/", ContinuationToken: token }),
    );
    const keys = (res.Contents ?? []).flatMap((o) => (o.Key ? [o.Key] : []));
    if (keys.length) await storage.deleteMany(keys);
    deleted += keys.length;
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  console.log(`Reset: removed ${deleted} objects`);
}

async function pool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]!);
    }),
  );
}

type Design = {
  card: Buffer;
  thumb400: { data: Buffer; width: number; height: number };
  thumb800: { data: Buffer; width: number; height: number };
  og: { data: Buffer; width: number; height: number };
  glb: Buffer;
  faction: Faction | null;
};

/** A real model from the game team, if given; kept outside the repo (it is a game asset). */
async function loadSampleGlb(): Promise<Buffer | null> {
  if (!args.glb) return null;
  const data = await readFile(args.glb);
  if (data.toString("ascii", 0, 4) !== "glTF") throw new Error(`${args.glb} is not a glTF binary`);
  console.log(`Using ${args.glb} (${(data.length / 1e6).toFixed(1)} MB) as the model for every miniature`);
  return data;
}

async function buildDesigns(): Promise<Design[]> {
  const sampleGlb = await loadSampleGlb();
  const factions: (Faction | null)[] = ["painted", "gilded", null];
  return Promise.all(
    Array.from({ length: DESIGNS }, async (_, i) => {
      const faction = factions[i % factions.length]!;
      const card = await placeholderCard(i, faction);
      const d = await deriveFromCard(card);
      const rgb: [number, number, number] =
        faction === "gilded" ? [0.79, 0.64, 0.15] : faction === "painted" ? [0.23, 0.44, 0.83] : [0.5, 0.5, 0.5];
      return { card, ...d, glb: sampleGlb ?? placeholderGlb(rgb), faction };
    }),
  );
}

async function main() {
  await runMigrations(db);
  if (config.S3_CREATE_BUCKET) await storage.ensureBucket();
  if (args.reset) await resetAll();

  console.log(`Rendering ${DESIGNS} placeholder designs…`);
  const designs = await buildDesigns();
  const byFaction = (f: Faction | null) => designs.filter((d) => d.faction === f);

  const now = Date.now();
  const DAY = 86_400_000;
  const collectionRows: (typeof collections.$inferInsert)[] = [];
  const miniatureRows: (typeof miniatures.$inferInsert)[] = [];
  const uploads: { key: string; data: Buffer; ext: FileExt }[] = [];

  while (miniatureRows.length < COUNT) {
    const cid = newPublicId();
    // Most players share a handful; a few share dozens (limit is 50).
    const size = Math.min(COUNT - miniatureRows.length, rand() < 0.8 ? int(1, 6) : int(10, 40));
    const firstAt = now - int(1, 60) * DAY - int(0, DAY);
    collectionRows.push({ id: cid, ownerName: pick(OWNERS), createdAt: new Date(firstAt) });

    for (let k = 0; k < size; k++) {
      const mid = newPublicId();
      const faction = factionFor();
      const design = pick(byFaction(faction));
      const createdAt = new Date(firstAt + int(0, Math.min(20 * DAY, now - firstAt)));
      const kit = pick(KITS);
      const parts: Part[] = Array.from({ length: int(2, 6) }, (_, p) => ({
        part_id: `${kit.id.slice(4)}_part_${String(p + 1).padStart(2, "0")}`,
        kit_id: kit.id,
        kit_name: kit.name,
      }));
      const paints = [...PAINTS].sort(() => rand() - 0.5).slice(0, int(1, 5));

      const put = (data: Buffer, ext: FileExt) => {
        const key = objectKey(cid, mid, data, ext);
        uploads.push({ key, data, ext });
        return key;
      };
      const files: MiniatureFiles = {
        glb: { key: put(design.glb, "glb"), bytes: design.glb.length },
        card: { key: put(design.card, "png"), bytes: design.card.length, width: 1200, height: 1600 },
        thumb400: { key: put(design.thumb400.data, "webp"), bytes: design.thumb400.data.length, width: design.thumb400.width, height: design.thumb400.height },
        thumb800: { key: put(design.thumb800.data, "webp"), bytes: design.thumb800.data.length, width: design.thumb800.width, height: design.thumb800.height },
        og: { key: put(design.og.data, "png"), bytes: design.og.data.length, width: design.og.width, height: design.og.height },
      };

      miniatureRows.push({
        id: mid,
        collectionId: cid,
        miniatureGuid: randomUUID(),
        title: rand() < 0.15 ? pick(UK_TITLES) : `${pick(ADJECTIVES)} ${pick(NOUNS)}`,
        description: pick(DESCRIPTIONS),
        faction,
        parts,
        paints,
        strokeCount: int(80, 2400),
        workSeconds: int(600, 4 * 3600),
        appraisal: { showpiece: rand() < 0.2, profile: { poise: int(0, 5), reach: int(0, 5) } },
        gameVersion: "0.6.0",
        atlasSize: 2048,
        paintedAt: createdAt,
        files,
        views: int(0, 500),
        createdAt,
        updatedAt: createdAt,
      });
    }
  }

  console.log(`Uploading ${uploads.length} files…`);
  let done = 0;
  await pool(uploads, 32, async (u) => {
    await storage.put(u.key, u.data, u.ext);
    if (++done % 1000 === 0) console.log(`  ${done}/${uploads.length}`);
  });

  console.log(`Inserting ${collectionRows.length} collections and ${miniatureRows.length} miniatures…`);
  await db.transaction(async (tx) => {
    for (let i = 0; i < collectionRows.length; i += 500) {
      await tx.insert(collections).values(collectionRows.slice(i, i + 500));
    }
    for (let i = 0; i < miniatureRows.length; i += 200) {
      await tx.insert(miniatures).values(miniatureRows.slice(i, i + 200));
    }
  });
  await db.execute(sql`analyze ${miniatures}`);
  await db.execute(sql`analyze ${collections}`);
  console.log("Done.");
}

try {
  await main();
} finally {
  await pg.end({ timeout: 5 });
}
