import { useLocation } from "react-router";
import { DEFAULT_SORT } from "@mw/contract";
import type { Route } from "./+types/gallery";
import { FactionFilter } from "../components/FactionFilter";
import { SortSelect } from "../components/SortSelect";
import { ViewModeToggle } from "../components/ViewModeToggle";
import { TileGrid } from "../components/TileGrid";
import { fetchGalleryPage } from "../lib/api.server";
import { parseGalleryParams } from "../lib/gallery-params";
import { detectLang } from "../lib/i18n.server";
import { isLang, translate, useT } from "../lib/i18n";
import type { TilePage } from "../lib/tiles";

/**
 * First page is rendered on the server. "Show more" calls this same loader with
 * ?cursor= through a fetcher, so the browser never talks to the API directly.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { faction, sort } = parseGalleryParams(url.searchParams);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const lang = detectLang(request);

  if (!cursor) {
    return { faction, sort, page: await fetchGalleryPage({ faction, sort, lang }), failed: false };
  }
  try {
    return { faction, sort, page: await fetchGalleryPage({ faction, sort, cursor, lang }), failed: false };
  } catch (err) {
    // A failed "Show more" must not replace the whole gallery with an error page.
    console.error(err);
    return { faction, sort, page: { tiles: [], nextCursor: cursor } satisfies TilePage, failed: true };
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
  const t = useT();
  const location = useLocation();
  const { faction, sort, page } = loaderData;
  const params: Record<string, string> = {};
  if (faction) params.faction = faction;
  if (sort !== DEFAULT_SORT) params.sort = sort;

  return (
    <div className="mx-auto max-w-screen-2xl px-4 pb-16 pt-5">
      {/* Title and Card/3D on top; filter and order below, wrapping on narrow phones. */}
      <div className="mb-5 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("gallery.title")}</h1>
          <ViewModeToggle />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FactionFilter current={faction} sort={sort} />
          <SortSelect faction={faction} sort={sort} />
        </div>
      </div>
      {/* A fresh grid for every history entry; its extra pages are cached under that entry. */}
      <TileGrid
        key={location.key}
        historyKey={location.key}
        page={page}
        action="/gallery"
        params={params}
        emptyText={t("gallery.empty")}
      />
    </div>
  );
}
