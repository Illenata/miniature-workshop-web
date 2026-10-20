import { z } from "zod";

/**
 * Error codes (spec appendix B). The game maps codes to player-facing text itself,
 * so codes are fixed: add new ones only through a spec change.
 */
export const ERROR_STATUS = {
  invalid_manifest: 400,
  missing_file: 400,
  /** Not in appendix B yet: malformed query (bad cursor or filter) on public GET routes. */
  invalid_request: 400,
  bad_key: 401,
  steam_ticket_invalid: 401,
  banned: 403,
  steam_mismatch: 403,
  not_found: 404,
  too_large: 413,
  bad_glb: 415,
  bad_card: 415,
  bad_journal: 415,
  text_rejected: 422,
  collection_full: 422,
  rate_limited: 429,
  /** Not in appendix B: unexpected server failure. */
  internal: 500,
  storage_unavailable: 503,
  steam_unavailable: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;
export const ERROR_CODES = Object.keys(ERROR_STATUS) as ErrorCode[];

export const apiErrorSchema = z.object({
  error: z.enum(ERROR_CODES as [ErrorCode, ...ErrorCode[]]),
  /** English, for logs; never shown to players as-is. */
  message: z.string(),
  /** Offending field, or empty string. */
  field: z.string(),
  /** Seconds; only with 429. */
  retry_after: z.int().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
