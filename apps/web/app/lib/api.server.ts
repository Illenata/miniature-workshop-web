import { DEFAULT_SORT, MINIATURE_HIDDEN_MESSAGE, type CollectionInfo, type CollectionPage, type Faction, type MiniatureItem, type MiniatureList, type Sort } from "@mw/contract";
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

export type ReportResult = { kind: "ok" } | { kind: "rate_limited" } | { kind: "not_found" } | { kind: "invalid"; field: string };

/**
 * Sends a report on behalf of the visitor. Behind the reverse proxy, X-Forwarded-For
 * carries the visitor's address; it is passed on so the API's per-IP limits apply to the
 * visitor, not to this server. (The API only trusts that header from private networks.)
 */
export async function postReport(
  body: { miniature_id: string; reason: string; text: string },
  forwardedFor: string | null,
): Promise<ReportResult> {
  const res = await fetch(`${env.apiUrl}/api/v1/reports`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(forwardedFor ? { "X-Forwarded-For": forwardedFor } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  if (res.status === 201) return { kind: "ok" };
  if (res.status === 429) return { kind: "rate_limited" };
  if (res.status === 404) return { kind: "not_found" };
  if (res.status === 400) {
    const err = (await res.json().catch(() => ({}))) as { field?: string };
    return { kind: "invalid", field: err.field ?? "" };
  }
  throw new ApiRequestError(res.status, "unknown", await res.text().catch(() => ""));
}

export type CollectionResult =
  | { kind: "ok"; collection: CollectionInfo; page: TilePage; firstOgImage: string | null }
  | { kind: "missing" };

/** A collection and one page of its miniatures, newest first. Missing or banned: "missing". */
export async function fetchCollectionPage(
  id: string,
  opts: { cursor?: string; lang: Lang },
): Promise<CollectionResult> {
  const qs = opts.cursor ? `?${new URLSearchParams({ cursor: opts.cursor })}` : "";
  try {
    const res = await getJson<CollectionPage>(`/api/v1/collections/${encodeURIComponent(id)}${qs}`);
    return {
      kind: "ok",
      collection: res.collection,
      page: { tiles: res.items.map((i) => toTile(i, opts.lang)), nextCursor: res.next_cursor },
      firstOgImage: res.items[0]?.files.og ?? null,
    };
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 404) return { kind: "missing" };
    throw err;
  }
}
