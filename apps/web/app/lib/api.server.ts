import { DEFAULT_SORT, MINIATURE_HIDDEN_MESSAGE, type Faction, type MiniatureItem, type MiniatureList, type Sort } from "@mw/contract";
import { env } from "./env.server";
import { formatDate } from "./format";
import type { Lang } from "./i18n";
import type { Tile, TilePage } from "./tiles";

export type { Tile, TilePage };

export function toTile(item: MiniatureItem, lang: Lang): Tile {
  return {
    id: item.id,
    title: item.title,
    faction: item.faction,
    collectionId: item.owner.collection_id,
    ownerName: item.owner.name,
    thumb400: item.files.thumb_400,
    thumb800: item.files.thumb_800,
    glb: item.files.glb,
    createdAt: item.created_at,
    published: formatDate(lang, item.created_at),
  };
}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly apiMessage: string,
  ) {
    super(`API responded ${status} ${code}: ${apiMessage}`);
  }
}

async function getJson<T>(path: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${env.apiUrl}${path}`, {
    headers: { Accept: "application/json", ...headers },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new ApiRequestError(res.status, body.error ?? "unknown", body.message ?? "");
  }
  return (await res.json()) as T;
}

export type MiniatureResult =
  | { kind: "ok"; item: MiniatureItem }
  | { kind: "hidden" }
  | { kind: "missing" };

/**
 * One miniature. `countView` makes the API count a page view (sent only for real page
 * loads by people, not bots or the QR/file routes).
 */
export async function fetchMiniature(id: string, opts: { countView: boolean }): Promise<MiniatureResult> {
  try {
    const item = await getJson<MiniatureItem>(
      `/api/v1/miniatures/${encodeURIComponent(id)}`,
      opts.countView ? { "x-mw-page-view": "1" } : {},
    );
    return { kind: "ok", item };
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 404) {
      return err.apiMessage === MINIATURE_HIDDEN_MESSAGE ? { kind: "hidden" } : { kind: "missing" };
    }
    throw err;
  }
}

export async function fetchGalleryPage(opts: {
  faction?: Faction;
  sort: Sort;
  cursor?: string;
  lang: Lang;
}): Promise<TilePage> {
  const params = new URLSearchParams();
  if (opts.faction) params.set("faction", opts.faction);
  if (opts.sort !== DEFAULT_SORT) params.set("sort", opts.sort);
  if (opts.cursor) params.set("cursor", opts.cursor);
  const qs = params.size ? `?${params}` : "";
  const page = await getJson<MiniatureList>(`/api/v1/gallery${qs}`);
  return { tiles: page.items.map((i) => toTile(i, opts.lang)), nextCursor: page.next_cursor };
}
