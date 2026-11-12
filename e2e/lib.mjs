// Shared settings for the browser checks. Everything comes from environment variables, so nothing local
// (passwords, paths, ports) lives in the scripts. See e2e/README.md.
import { chromium } from "playwright";
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const here = fileURLToPath(new URL(".", import.meta.url));

/** Value from the environment, then from the repo's .env, then from .env.example. */
export function setting(key) {
  if (process.env[key]) return process.env[key];
  for (const file of [".env", ".env.example"]) {
    const path = join(here, "..", file);
    const value = existsSync(path) && readFileSync(path, "utf8").match(new RegExp(`^${key}=(.*)$`, "m"))?.[1].trim();
    if (value) return value;
  }
  return undefined;
}

export const BASE = process.env.E2E_BASE_URL ?? "http://localhost:5173";
export const API = process.env.E2E_API_URL ?? "http://127.0.0.1:3000";
/** Bucket URL of the S3 storage, for checking that files exist (anonymous GET: 403 = exists, 404 = gone). */
export const S3 = process.env.E2E_S3_URL ?? `${setting("S3_ENDPOINT")}/${setting("S3_BUCKET")}`;
export const DATABASE_URL = process.env.E2E_DATABASE_URL ?? setting("DATABASE_URL");

/** Screenshots go to e2e/.out (ignored by git). */
export const OUT = process.env.E2E_OUT ?? join(here, ".out");
mkdirSync(OUT, { recursive: true });
export const shot = (name) => join(OUT, name);

/** Starts Chromium; E2E_CHROMIUM points to a specific binary when Playwright's own is not installed. */
export function launch({ webgl = false } = {}) {
  return chromium.launch({
    executablePath: process.env.E2E_CHROMIUM || undefined,
    args: webgl ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : [],
  });
}

/** Runs SQL through the psql CLI and returns trimmed text output. */
export function psql(sql) {
  return execFileSync("psql", [DATABASE_URL, "-Atc", sql]).toString().trim();
}

/** Admin credentials: E2E_ADMIN_PASSWORD (plain password matching ADMIN_PASSWORD_HASH) and the TOTP secret. */
export function adminCredentials() {
  const password = process.env.E2E_ADMIN_PASSWORD;
  const secret = setting("ADMIN_TOTP_SECRET");
  if (!password || !secret) {
    console.error("Set E2E_ADMIN_PASSWORD, and ADMIN_TOTP_SECRET in the environment or in .env");
    process.exit(2);
  }
  return { password, totp: (offsetSteps = 0) => totp(secret, offsetSteps) };
}

function base32(s) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, v = 0;
  const out = [];
  for (const c of s.toUpperCase().replace(/=+$/, "")) {
    v = (v << 5) | A.indexOf(c);
    bits += 5;
    if (bits >= 8) { bits -= 8; out.push((v >>> bits) & 255); }
  }
  return Buffer.from(out);
}

function totp(secret, offsetSteps) {
  const step = Math.floor(Date.now() / 30000) + offsetSteps;
  const c = Buffer.alloc(8);
  c.writeBigUInt64BE(BigInt(step));
  const m = createHmac("sha1", base32(secret)).update(c).digest();
  const o = m[m.length - 1] & 15;
  return String((m.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, "0");
}
