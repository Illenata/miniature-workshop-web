import { useEffect, useRef, useState } from "react";
import { useFetcher, useLocation } from "react-router";
import { factionSchema, type Faction } from "@mw/contract";
import type { Route } from "./+types/gallery";
import { FactionFilter } from "../components/FactionFilter";
import { ViewModeToggle } from "../components/ViewModeToggle";
import { MiniatureTile } from "../components/MiniatureTile";
import { fetchGalleryPage } from "../lib/api.server";
import { isHydrated } from "../lib/hydration";
import { isLang, translate, useT } from "../lib/i18n";
import { loadModelViewer } from "../lib/model-viewer";
import { useViewMode } from "../lib/view-mode";
import type { TilePage } from "../lib/tiles";

function parseFaction(value: string | null): Faction | undefined {
  const parsed = factionSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/**
 * First page is rendered on the server. "Show more" calls this same loader with
 * ?cursor= through a fetcher, so the browser never talks to the API directly.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const faction = parseFaction(url.searchParams.get("faction"));
  const cursor = url.searchParams.get("cursor") ?? undefined;

  if (!cursor) {
    return { faction, page: await fetchGalleryPage({ faction }), failed: false };
  }
  try {
    return { faction, page: await fetchGalleryPage({ faction, cursor }), failed: false };
  } catch (err) {
    // A failed "Show more" must not replace the whole gallery with an error page.
    console.error(err);
    return { faction, page: { tiles: [], nextCursor: cursor } satisfies TilePage, failed: true };
  }
}

export function meta({ matches }: Route.MetaArgs) {
  const rootLang = (matches[0]?.data as { lang?: unknown } | undefined)?.lang;
  const lang = isLang(rootLang) ? rootLang : "en";
  return [
    { title: translate(lang, "gallery.metaTitle") },
    { name: "description", content: translate(lang, "site.description") },
  ];
}

export default function Gallery({ loaderData }: Route.ComponentProps) {
  const location = useLocation();
  // A fresh grid for every history entry; its extra pages are cached under that entry.
  return <GalleryView key={location.key} historyKey={location.key} {...loaderData} />;
}

const cacheKey = (historyKey: string) => `gallery:${historyKey}`;

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

type ViewProps = { historyKey: string; faction: Faction | undefined; page: TilePage };

function GalleryView({ historyKey, faction, page }: ViewProps) {
  const t = useT();
  const [state, setState] = useState<TilePage>(() => readCached(historyKey) ?? page);
  const [announcement, setAnnouncement] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const fetcher = useFetcher<typeof loader>();
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
    <div className="mx-auto max-w-screen-2xl px-4 pb-16 pt-5">
      {/* Phones: title and Card/3D on one row, filter below. Wider: all on one row. */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-semibold tracking-tight sm:text-2xl">{t("gallery.title")}</h1>
        <div className="order-3 w-full sm:order-2 sm:w-auto">
          <FactionFilter current={faction} />
        </div>
        <div className="order-2 sm:order-3">
          <ViewModeToggle />
        </div>
      </div>

      {state.tiles.length === 0 ? (
        <p className="py-16 text-center text-muted">{t("gallery.empty")}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {state.tiles.map((tile, i) => (
            <MiniatureTile
              key={tile.id}
              tile={tile}
              mode={mode}
              priority={i < 2 ? "high" : i < 6 ? "eager" : "lazy"}
            />
          ))}
        </ul>
      )}

      <div className="mt-8 flex flex-col items-center gap-3">
        {state.nextCursor ? (
          // A real GET form: without JS it navigates to the next page; with JS the fetcher appends it.
          <fetcher.Form method="get" action="/gallery">
            {faction && <input type="hidden" name="faction" value={faction} />}
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
    </div>
  );
}
