import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0", ""])
  .transform((v) => v === "true" || v === "1");

const url = z.url().transform((v) => v.replace(/\/+$/, ""));

/** All configuration comes from the environment (spec section 3). See .env.example. */
const configSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  DATABASE_URL: z.string().min(1),

  S3_ENDPOINT: url.optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: bool.default(true),
  S3_CREATE_BUCKET: bool.default(false),

  /** Origin of the public pages, used for miniature and collection URLs. */
  PUBLIC_BASE_URL: url,
  /** Separate origin for user files (files.<domain> in production). */
  FILES_BASE_URL: url,

  GALLERY_PAGE_SIZE: z.coerce.number().int().min(1).max(100).default(24),
  REPORTS_PER_IP_PER_DAY: z.coerce.number().int().min(1).default(10),
  AUTO_HIDE_REPORTS: z.coerce.number().int().min(1).default(3),

  /** Secret salt for hashing IPs (spec section 3: IPs are stored only as salted hashes). */
  IP_HASH_SALT: z.string().min(16),
  /**
   * Which direct peers may set X-Forwarded-For: the reverse proxy and the page server.
   * Default: loopback and private networks (docker), never the public internet.
   */
  TRUST_PROXY: z.string().default("loopback,linklocal,uniquelocal"),

  /**
   * Admin panel login (spec section 7): scrypt hash of the password and the TOTP secret,
   * both printed by `npm run admin:setup`. Either one empty: the admin panel is disabled.
   */
  ADMIN_PASSWORD_HASH: z.string().optional().transform((v) => v?.trim() || undefined),
  ADMIN_TOTP_SECRET: z.string().optional().transform((v) => v?.trim() || undefined),
  ADMIN_SESSION_HOURS: z.coerce.number().min(1).max(24).default(12),

  /** Moderator email (spec section 7). Empty SMTP_URL or MODERATOR_EMAIL: no email, only logs. */
  SMTP_URL: z.string().optional().transform((v) => v?.trim() || undefined),
  MAIL_FROM: z.string().default("Miniature Workshop <noreply@localhost>"),
  MODERATOR_EMAIL: z.string().optional().transform((v) => v?.trim() || undefined),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join("\n")}`);
  }
  return result.data;
}

/** The value shipped in .env.example; the server warns at startup while it is in use. */
export const EXAMPLE_SALT = "local-dev-only-change-me-in-production";
