import { randomBytes } from "node:crypto";
import { PUBLIC_ID_ALPHABET, PUBLIC_ID_LENGTH } from "@mw/contract";

/**
 * Random public id: 12 chars × 5 bits = 60 bits. Each byte keeps its low 5 bits,
 * and 256 is a multiple of 32, so every character is uniformly distributed.
 */
export function newPublicId(): string {
  const bytes = randomBytes(PUBLIC_ID_LENGTH);
  let id = "";
  for (const b of bytes) id += PUBLIC_ID_ALPHABET[b & 31];
  return id;
}
