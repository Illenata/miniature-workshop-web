import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { isPublicId } from "@mw/contract";
import { collectionScope, decodeCursor, encodeCursor, galleryScope } from "../src/lib/cursor.ts";
import { newPublicId } from "../src/lib/ids.ts";
import { TtlCache } from "../src/lib/ttl-cache.ts";
import { deriveFromCard } from "../src/media/derivatives.ts";
import { objectKey } from "../src/storage/storage.ts";
import { placeholderCard, placeholderGlb } from "../scripts/placeholders.ts";
import { hashIp } from "../src/lib/ip-hash.ts";
import { hashPassword, verifyPassword } from "../src/lib/password.ts";
import { base32Decode, base32Encode, totpAt, verifyTotp } from "../src/lib/totp.ts";

describe("public ids", () => {
  it("are valid and do not repeat", () => {
    const ids = Array.from({ length: 5000 }, newPublicId);
    expect(ids.every(isPublicId)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("cursor", () => {
  const c = { key: "2026-10-20T18:44:59.042Z", id: "b8nq2w5r7ycd" };

  it("round-trips date and title keys", () => {
    const scope = galleryScope("painted", "newest");
    expect(decodeCursor(encodeCursor({ ...c, scope }), scope)).toEqual({ ...c, scope });
    const titleScope = galleryScope(undefined, "title_asc");
    const t = { key: "Лучник степу 🎨", id: c.id, scope: titleScope };
    expect(decodeCursor(encodeCursor(t), titleScope)).toEqual(t);
  });

  it("is rejected for another filter or order", () => {
    const raw = encodeCursor({ ...c, scope: galleryScope("painted", "newest") });
    expect(decodeCursor(raw, galleryScope(undefined, "newest"))).toBeNull();
    expect(decodeCursor(raw, galleryScope("painted", "oldest"))).toBeNull();
    expect(decodeCursor(raw, collectionScope("7k3m9q2vx4ht", "newest"))).toBeNull();
  });

  it("returns null for garbage", () => {
    for (const raw of ["", "garbage", "e30", Buffer.from('{"k":1}').toString("base64url")]) {
      expect(decodeCursor(raw, galleryScope(undefined, "newest"))).toBeNull();
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


describe("IP hashing", () => {
  it("is stable per salt and never contains the IP", () => {
    const a = hashIp("203.0.113.7", "salt-one-0123456789");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hashIp("203.0.113.7", "salt-one-0123456789")).toBe(a);
    expect(hashIp("203.0.113.7", "salt-two-0123456789")).not.toBe(a);
  });
});

describe("TOTP (RFC 6238)", () => {
  // RFC 6238 appendix B test secret, SHA-1.
  const secret = Buffer.from("12345678901234567890");
  const b32 = base32Encode(secret);

  it("matches the RFC test vectors", () => {
    expect(totpAt(secret, Math.floor(59 / 30), 8)).toBe("94287082");
    expect(totpAt(secret, Math.floor(1111111109 / 30), 8)).toBe("07081804");
    expect(totpAt(secret, Math.floor(2000000000 / 30), 8)).toBe("69279037");
  });

  it("round-trips base32", () => {
    expect(base32Decode(b32).equals(secret)).toBe(true);
    expect(base32Decode("gezd gnbv-GY3T QOJQ gezdgnbvgy3tqojq").equals(secret)).toBe(true);
  });

  it("accepts the current code and one step of clock drift, nothing else", () => {
    const now = 1_700_000_000_000;
    const step = Math.floor(now / 30_000);
    expect(verifyTotp(b32, totpAt(secret, step), now)).toBe(step);
    expect(verifyTotp(b32, totpAt(secret, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(b32, totpAt(secret, step + 1), now)).toBe(step + 1);
    expect(verifyTotp(b32, totpAt(secret, step - 2), now)).toBeNull();
    expect(verifyTotp(b32, "12345", now)).toBeNull();
    expect(verifyTotp(b32, "abcdef", now)).toBeNull();
  });
});

describe("admin password", () => {
  it("verifies the right password only, and the hash has no $ (docker env files)", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).toMatch(/^scrypt:\d+:\d+:\d+:[\w-]+:[\w-]+$/);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("correct horse batterY", hash)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
});
