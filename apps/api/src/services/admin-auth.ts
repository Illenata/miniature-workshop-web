import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, lt } from "drizzle-orm";
import type { Config } from "../config.ts";
import type { Db } from "../db/client.ts";
import { adminActions, adminSessions, appState } from "../db/schema.ts";
import { verifyPassword } from "../lib/password.ts";
import { verifyTotp } from "../lib/totp.ts";

export const ADMIN_ACTOR = "admin"; // one moderator (spec section 7)
const TOTP_STEP_KEY = "admin_totp_last_step";
const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 15 * 60_000;

export type LoginResult =
  | { kind: "ok"; token: string; expiresAt: Date }
  | { kind: "disabled" }
  | { kind: "invalid" }
  | { kind: "rate_limited"; retryAfter: number };

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function logAdminAction(db: Db, action: string, target = ""): Promise<void> {
  await db.insert(adminActions).values({ actor: ADMIN_ACTOR, action, target });
}

/**
 * Password + TOTP login (spec section 7). Failed attempts are limited per address
 * (5 in 15 minutes); a TOTP code works once; sessions last ADMIN_SESSION_HOURS and only
 * the hash of the session token is stored.
 */
export class AdminAuth {
  /** Failure timestamps per hashed IP. In memory: one server, and a restart only resets the count. */
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly db: Db,
    private readonly config: Pick<Config, "ADMIN_PASSWORD_HASH" | "ADMIN_TOTP_SECRET" | "ADMIN_SESSION_HOURS">,
  ) {}

  get enabled(): boolean {
    return Boolean(this.config.ADMIN_PASSWORD_HASH && this.config.ADMIN_TOTP_SECRET);
  }

  async login(password: string, code: string, ipHash: string, now = new Date()): Promise<LoginResult> {
    if (!this.enabled) return { kind: "disabled" };

    const recent = (this.failures.get(ipHash) ?? []).filter((t) => t > now.getTime() - FAILURE_WINDOW_MS);
    if (recent.length >= MAX_FAILURES) {
      const retryAfter = Math.ceil((recent[0]! + FAILURE_WINDOW_MS - now.getTime()) / 1000);
      return { kind: "rate_limited", retryAfter: Math.max(1, retryAfter) };
    }

    // Both factors are always checked, and the answer never says which one was wrong.
    const passwordOk = await verifyPassword(password, this.config.ADMIN_PASSWORD_HASH!);
    const step = verifyTotp(this.config.ADMIN_TOTP_SECRET!, code, now.getTime());
    const fresh = step !== null && (await this.claimTotpStep(step));

    if (!passwordOk || !fresh) {
      recent.push(now.getTime());
      this.failures.set(ipHash, recent);
      await logAdminAction(this.db, "login_failed");
      return { kind: "invalid" };
    }
    this.failures.delete(ipHash);

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + this.config.ADMIN_SESSION_HOURS * 3_600_000);
    await this.db.delete(adminSessions).where(lt(adminSessions.expiresAt, now));
    await this.db.insert(adminSessions).values({ tokenHash: sha256(token), createdAt: now, expiresAt });
    await logAdminAction(this.db, "login");
    return { kind: "ok", token, expiresAt };
  }

  /** A code is accepted once: its time step must be newer than the last one used. */
  private async claimTotpStep(step: number): Promise<boolean> {
    const [row] = await this.db.select().from(appState).where(eq(appState.key, TOTP_STEP_KEY));
    if (row && typeof row.value === "number" && row.value >= step) return false;
    await this.db
      .insert(appState)
      .values({ key: TOTP_STEP_KEY, value: step })
      .onConflictDoUpdate({ target: appState.key, set: { value: step, updatedAt: new Date() } });
    return true;
  }

  /** Returns when the session expires, or null if the token is unknown or expired. */
  async session(token: string, now = new Date()): Promise<Date | null> {
    if (!this.enabled || !token) return null;
    const [row] = await this.db
      .select({ expiresAt: adminSessions.expiresAt })
      .from(adminSessions)
      .where(and(eq(adminSessions.tokenHash, sha256(token)), gt(adminSessions.expiresAt, now)));
    return row?.expiresAt ?? null;
  }

  async logout(token: string): Promise<void> {
    const removed = await this.db
      .delete(adminSessions)
      .where(eq(adminSessions.tokenHash, sha256(token)))
      .returning({ h: adminSessions.tokenHash });
    if (removed.length) await logAdminAction(this.db, "logout");
  }

  async recentActions(limit: number) {
    return this.db.select().from(adminActions).orderBy(desc(adminActions.id)).limit(limit);
  }
}
