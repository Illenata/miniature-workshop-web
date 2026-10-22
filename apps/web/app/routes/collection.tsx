import { data, useLocation } from "react-router";
import type { Route } from "./+types/collection";
import { ShareButton } from "../components/ShareButton";
import { TileGrid } from "../components/TileGrid";
import { ViewModeToggle } from "../components/ViewModeToggle";
import { fetchCollectionPage } from "../lib/api.server";
import { formatDate, formatNumber, pluralCategory } from "../lib/format";
import { isLang, translate, useT, type Lang, type MessageKey } from "../lib/i18n";
import { detectLang } from "../lib/i18n.server";
import type { TilePage } from "../lib/tiles";

function workshopName(lang: Lang, name: string | null, id: string) {
  return name ? translate(lang, "workshop.named", { name }) : translate(lang, "workshop.anonymous", { id });
}

/**
 * /c/<id> (spec section 6): a player's workshop. First page server-rendered; "Show more"
 * calls this loader with ?cursor= (same pattern as the gallery). Missing or banned: 404.
 */
export async function loader({ params, request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const lang = detectLang(request);

  let result: Awaited<ReturnType<typeof fetchCollectionPage>>;
  try {
    result = await fetchCollectionPage(params.id, { cursor, lang });
  } catch (err) {
    // A failed "Show more" must not replace the whole page with an error.
    if (!cursor) throw err;
    console.error(err);
    return { page: { tiles: [], nextCursor: cursor } satisfies TilePage, failed: true, header: null };
  }
  if (result.kind === "missing") throw data(null, { status: 404 });

  const { collection } = result;
  const count = translate(lang, `c.count.${pluralCategory(lang, collection.miniature_count)}` as MessageKey, {
    count: formatNumber(lang, collection.miniature_count),
  });
  return {
    page: result.page,
    failed: false,
    header: {
      id: collection.id,
      url: collection.url,
      name: workshopName(lang, collection.name, collection.id),
      count,
      since: formatDate(lang, collection.created_at),
      createdAt: collection.created_at,
      ogImage: cursor ? null : result.firstOgImage,
    },
  };
}

export function meta({ loaderData, matches }: Route.MetaArgs) {
  const rootLang = (matches[0]?.data as { lang?: unknown } | undefined)?.lang;
  const lang = isLang(rootLang) ? rootLang : "en";
  const h = loaderData?.header;
  if (!h) return [{ title: translate(lang, "error.notFoundTitle") }, { name: "robots", content: "noindex" }];
  const description = translate(lang, "c.description", { count: h.count });
  return [
    { title: translate(lang, "c.metaTitle", { name: h.name }) },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: h.url },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Miniature Workshop" },
    { property: "og:title", content: h.name },
    { property: "og:description", content: description },
    { property: "og:url", content: h.url },
    // The newest miniature's preview stands for the whole collection.
    ...(h.ogImage
      ? [
          { property: "og:image", content: h.ogImage },
          { property: "og:image:width", content: "1200" },
          { property: "og:image:height", content: "630" },
          { name: "twitter:card", content: "summary_large_image" },
          { name: "twitter:image", content: h.ogImage },
        ]
      : [{ name: "twitter:card", content: "summary" }]),
    { name: "twitter:title", content: h.name },
    { name: "twitter:description", content: description },
  ];
}

export default function CollectionPage({ loaderData }: Route.ComponentProps) {
  const t = useT();
  const location = useLocation();
  const h = loaderData.header!;

  return (
    <div className="mx-auto max-w-screen-2xl px-4 pb-16 pt-5">
      <header className="mb-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">{h.name}</h1>
            <p className="mt-1 text-sm text-muted">
              {h.count} · <time dateTime={h.createdAt}>{t("c.since", { date: h.since })}</time>
            </p>
          </div>
          <ViewModeToggle />
        </div>

        <div className="mt-4 flex flex-wrap items-start gap-2">
          <ShareButton
            title={h.name}
            url={h.url}
            label={t("c.share")}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-5 text-sm font-medium text-surface hover:opacity-90"
          />
          {/* A disclosure, so the QR costs nothing until someone wants to show it. */}
          <details className="group">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-full border border-line px-4 text-sm font-medium hover:border-muted [&::-webkit-details-marker]:hidden">
              {t("c.qrShow")}
            </summary>
            <div className="mt-3 w-fit rounded-xl bg-white p-3">
              <img src={`/c/${h.id}/qr.png`} alt={t("c.qrAlt")} width={200} height={200} loading="lazy" />
            </div>
            <p className="mt-2 text-xs text-muted">{t("c.qrHint")}</p>
          </details>
        </div>
      </header>

      <TileGrid
        key={location.key}
        historyKey={location.key}
        page={loaderData.page}
        action={`/c/${h.id}`}
        showWorkshop={false}
        emptyText={t("c.empty")}
      />
    </div>
  );
}
