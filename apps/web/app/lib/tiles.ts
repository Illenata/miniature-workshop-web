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
};

export type TilePage = { tiles: Tile[]; nextCursor: string | null };
