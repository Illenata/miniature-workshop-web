import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { MiniatureTile } from "./MiniatureTile";
import { isHydrated } from "../lib/hydration";
import { useT } from "../lib/i18n";
import { loadModelViewer } from "../lib/model-viewer";
import type { TilePage } from "../lib/tiles";
import { useViewMode } from "../lib/view-mode";

/** What a list route's loader returns for "Show more" (?cursor=). */
export type MorePage = { page: TilePage; failed: boolean };

type Props = {
  /** location.key: extra pages are cached per history entry. */
  historyKey: string;
  page: TilePage;
  /** The route whose loader serves the next page (?cursor=). */
  action: string;
  /** Query parameters the next-page request must keep (filter, order). */
  params?: Record<string, string>;
  showWorkshop?: boolean;
  emptyText: string;
};

/** 2 columns on phones up to 6 on wide screens; MiniatureTile's TILE_SIZES matches these. */
export const GRID_CLASS =
  "grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6";

const cacheKey = (historyKey: string) => `grid:${historyKey}`;

/**
 * "Show more" pages are kept per history entry in sessionStorage, so going back from a
 * miniature returns to the same scroll position with everything that was loaded.
 * Read only on client-side navigation: during hydration the first render must match
 * the server HTML.
 */
function readCached(historyKey: string): TilePage | null {
  if (typeof window === "undefined" || !isHydrated()) return null;
  try {
    const raw = sessionStorage.getItem(cacheKey(historyKey));
    return raw ? (JSON.parse(raw) as TilePage) : null;
  } catch {
    return null;
  }
}

function writeCached(historyKey: string, page: TilePage) {
  try {
    sessionStorage.setItem(cacheKey(historyKey), JSON.stringify(page));
  } catch {
    // Storage full or blocked: back navigation simply starts from the first page.
  }
}

/**
 * The miniature grid shared by the gallery and collection pages (spec section 6):
 * 2 columns on phones up to 6 on wide screens, Card/3D tiles, and "Show more" that
 * appends pages through a fetcher (a plain GET link without JS).
 */
export function TileGrid({ historyKey, page, action, params = {}, showWorkshop = true, emptyText }: Props) {
  const t = useT();
  const [state, setState] = useState<TilePage>(() => readCached(historyKey) ?? page);
  const [announcement, setAnnouncement] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const fetcher = useFetcher<MorePage>();
  const handled = useRef<unknown>(null);

  useEffect(() => {
    const data = fetcher.data;
    if (fetcher.state !== "idle" || !data || handled.current === data) return;
    handled.current = data;
    if (data.failed) {
      setLoadFailed(true);
      return;
    }
    setLoadFailed(false);
    setState((prev) => {
      const seen = new Set(prev.tiles.map((x) => x.id));
      const fresh = data.page.tiles.filter((x) => !seen.has(x.id));
      const next = { tiles: [...prev.tiles, ...fresh], nextCursor: data.page.nextCursor };
      writeCached(historyKey, next);
      setAnnouncement(t("gallery.loadedMore", { count: fresh.length }));
      return next;
    });
  }, [fetcher.state, fetcher.data, historyKey, t]);

  const loading = fetcher.state !== "idle";
  const mode = useViewMode();
  useEffect(() => {
    if (mode === "3d") void loadModelViewer();
  }, [mode]);

  return (
    <>
      {state.tiles.length === 0 ? (
        <p className="py-16 text-center text-muted">{emptyText}</p>
      ) : (
        <ul className={GRID_CLASS}>
          {state.tiles.map((tile, i) => (
            <MiniatureTile
              key={tile.id}
              tile={tile}
              mode={mode}
              showWorkshop={showWorkshop}
              priority={i < 2 ? "high" : i < 6 ? "eager" : "lazy"}
            />
          ))}
        </ul>
      )}

      <div className="mt-8 flex flex-col items-center gap-3">
        {state.nextCursor ? (
          // A real GET form: without JS it navigates to the next page; with JS the fetcher appends it.
          <fetcher.Form method="get" action={action}>
            {Object.entries(params).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <input type="hidden" name="cursor" value={state.nextCursor} />
            <button
              type="submit"
              disabled={loading}
              className="min-h-11 rounded-full border border-line bg-raised px-6 text-sm font-medium hover:border-muted disabled:opacity-60"
            >
              {loading ? t("gallery.loading") : t("gallery.showMore")}
            </button>
          </fetcher.Form>
        ) : (
          state.tiles.length > 0 && <p className="text-sm text-muted">{t("gallery.end")}</p>
        )}
        {loadFailed && (
          <p role="alert" className="text-sm text-red-300">
            {t("gallery.loadError")}
          </p>
        )}
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </div>
    </>
  );
}
