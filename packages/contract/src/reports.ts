import { z } from "zod";
import { publicIdSchema } from "./ids.ts";

/** Spec section 7: offensive content, spam, someone else's work, other. */
export const REPORT_REASONS = ["offensive", "spam", "stolen", "other"] as const;
export const reportReasonSchema = z.enum(REPORT_REASONS);
export type ReportReason = z.infer<typeof reportReasonSchema>;
export const REPORT_TEXT_MAX = 300;

/** Body of POST /api/v1/reports (spec section 8). */
export const reportRequestSchema = z.object({
  miniature_id: publicIdSchema,
  reason: reportReasonSchema,
  text: z
    .string()
    .refine((s) => [...s].length <= REPORT_TEXT_MAX, { message: `must be at most ${REPORT_TEXT_MAX} characters` })
    .regex(/^(?:[^\p{Cc}]|\r?\n)*$/u, "control characters are not allowed")
    .default(""),
});
export type ReportRequest = z.infer<typeof reportRequestSchema>;

/**
 * 201 response. A repeat report from the same IP for the same miniature is accepted
 * the same way but not stored twice (one open report per IP, spec section 7).
 */
export const reportResponseSchema = z.object({ status: z.literal("received") });
export type ReportResponse = z.infer<typeof reportResponseSchema>;
