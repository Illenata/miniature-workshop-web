import { z } from "zod";

/**
 * Public ids (spec section 4): 12 characters of lowercase Crockford base32,
 * without i, l, o, u. Opaque: they reveal neither the key nor creation order.
 */
export const PUBLIC_ID_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
export const PUBLIC_ID_LENGTH = 12;
export const PUBLIC_ID_PATTERN = /^[0-9a-hjkmnp-tv-z]{12}$/;

export const publicIdSchema = z.string().regex(PUBLIC_ID_PATTERN, "invalid id");
export type PublicId = z.infer<typeof publicIdSchema>;

export function isPublicId(value: string): boolean {
  return PUBLIC_ID_PATTERN.test(value);
}
