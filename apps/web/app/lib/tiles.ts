import type { Faction } from "@mw/contract";

/** Only what a gallery tile needs: keeps the HTML payload and the history cache small. */
export type Tile = {
  id: string;
  title: string;
  faction: Faction | null;
  collectionId: string;
  ownerName: string | null;
  thumb400: string;
  thumb800: string;
  /** Poster-quality card is thumb800; the model is only fetched in 3D mode. */
  glb: string;
  /** ISO 8601, for <time datetime>. */
  createdAt: string;
  /** Publication date already formatted for the page language (see lib/format.ts). */
  published: string;
};

export type TilePage = { tiles: Tile[]; nextCursor: string | null };
