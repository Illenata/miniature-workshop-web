import type { Faction, MiniatureItem, MiniatureList } from "@mw/contract";
import { env } from "./env.server";
import type { Tile, TilePage } from "./tiles";

export type { Tile, TilePage };

export function toTile(item: MiniatureItem): Tile {
  return {
    id: item.id,
    title: item.title,
    faction: item.faction,
    collectionId: item.owner.collection_id,
    ownerName: item.owner.name,
    thumb400: item.files.thumb_400,
    thumb800: item.files.thumb_800,
  };
}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`API responded ${status} ${code}`);
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${env.apiUrl}${path}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiRequestError(res.status, body.error ?? "unknown");
  }
  return (await res.json()) as T;
}

export async function fetchGalleryPage(opts: { faction?: Faction; cursor?: string }): Promise<TilePage> {
  const params = new URLSearchParams();
  if (opts.faction) params.set("faction", opts.faction);
  if (opts.cursor) params.set("cursor", opts.cursor);
  const qs = params.size ? `?${params}` : "";
  const page = await getJson<MiniatureList>(`/api/v1/gallery${qs}`);
  return { tiles: page.items.map(toTile), nextCursor: page.next_cursor };
}
