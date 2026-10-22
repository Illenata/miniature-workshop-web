import { createHmac } from "node:crypto";

/** HMAC-SHA256 of the IP with a secret salt: stable for limits and bans, not reversible. */
export function hashIp(ip: string, salt: string): string {
  return createHmac("sha256", salt).update(ip).digest("hex");
}
