import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { isPublicId } from "@mw/contract";
import { collectionScope, decodeCursor, encodeCursor, galleryScope } from "../src/lib/cursor.ts";
import { newPublicId } from "../src/lib/ids.ts";
import { TtlCache } from "../src/lib/ttl-cache.ts";
import { deriveFromCard } from "../src/media/derivatives.ts";
import { objectKey } from "../src/storage/storage.ts";
import { placeholderCard, placeholderGlb } from "../scripts/placeholders.ts";

describe("public ids", () => {
  it("are valid and do not repeat", () => {
    const ids = Array.from({ length: 5000 }, newPublicId);
    expect(ids.every(isPublicId)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("cursor", () => {
  const c = { createdAt: new Date("2026-10-20T18:44:59.042Z"), id: "b8nq2w5r7ycd" };

  it("round-trips with millisecond precision", () => {
    const scope = galleryScope("painted");
    expect(decodeCursor(encodeCursor({ ...c, scope }), scope)).toEqual({ ...c, scope });
  });

  it("is rejected for another filter", () => {
    const raw = encodeCursor({ ...c, scope: galleryScope("painted") });
    expect(decodeCursor(raw, galleryScope(undefined))).toBeNull();
    expect(decodeCursor(raw, collectionScope("7k3m9q2vx4ht"))).toBeNull();
  });

  it("returns null for garbage", () => {
    for (const raw of ["", "garbage", "e30", Buffer.from('{"t":1}').toString("base64url")]) {
      expect(decodeCursor(raw, galleryScope(undefined))).toBeNull();
    }
  });
});

describe("TtlCache", () => {
  it("expires entries and caps size", () => {
    let now = 0;
    const cache = new TtlCache<number>(1000, 2, () => now);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3); // evicts "a"
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("c")).toBe(3);
    now = 1000;
    expect(cache.get("b")).toBeUndefined();
  });
});

describe("storage keys", () => {
  it("are content-addressed", () => {
    const key = objectKey("7k3m9q2vx4ht", "b8nq2w5r7ycd", Buffer.from("hello"), "png");
    expect(key).toBe(
      "collections/7k3m9q2vx4ht/b8nq2w5r7ycd/2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824.png",
    );
  });
});

describe("derivatives", () => {
  it("makes 3:4 WebP thumbs and a 1200×630 opaque OG image", async () => {
    const card = await placeholderCard(1, "gilded");
    const { thumb400, thumb800, og } = await deriveFromCard(card);

    const t4 = await sharp(thumb400.data).metadata();
    const t8 = await sharp(thumb800.data).metadata();
    const o = await sharp(og.data).metadata();
    expect([t4.format, t4.width, t4.height]).toEqual(["webp", 400, 533]);
    expect([t8.format, t8.width, t8.height]).toEqual(["webp", 800, 1067]);
    expect([o.format, o.width, o.height, o.hasAlpha]).toEqual(["png", 1200, 630, false]);
  });
});

describe("placeholder glb", () => {
  it("is a well-formed glTF 2.0 binary", () => {
    const glb = placeholderGlb([0.5, 0.5, 0.5]);
    expect(glb.toString("ascii", 0, 4)).toBe("glTF");
    expect(glb.readUInt32LE(4)).toBe(2);
    expect(glb.readUInt32LE(8)).toBe(glb.length);

    const jsonLen = glb.readUInt32LE(12);
    expect(glb.readUInt32LE(16)).toBe(0x4e4f534a);
    const gltf = JSON.parse(glb.toString("utf8", 20, 20 + jsonLen));
    const binHeader = 20 + jsonLen;
    expect(glb.readUInt32LE(binHeader + 4)).toBe(0x004e4942);
    expect(glb.readUInt32LE(binHeader)).toBe(gltf.buffers[0].byteLength);
    expect(gltf.meshes).toHaveLength(1);
    expect(gltf.materials).toHaveLength(1);
    // About 3 cm tall, like a real miniature.
    expect(gltf.accessors[0].max[1]).toBeCloseTo(0.027);
  });
});
