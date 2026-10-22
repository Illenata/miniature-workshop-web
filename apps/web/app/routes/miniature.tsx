import { isbot } from "isbot";
import { data, isRouteErrorResponse, Link, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/miniature";
import { MiniatureSpecs } from "../components/MiniatureSpecs";
import { MiniatureViewer } from "../components/MiniatureViewer";
import { ShareButton } from "../components/ShareButton";
import { fetchMiniature } from "../lib/api.server";
import { formatDate, formatNumber, pluralCategory } from "../lib/format";
import { isLang, translate, useT, type MessageKey } from "../lib/i18n";
import { detectLang } from "../lib/i18n.server";

const DESCRIPTION_PREVIEW = 160; // spec section 6: first 160 characters for link previews

export async function loader({ params, request }: Route.LoaderArgs) {
  // Link-preview bots (Discord, Telegram, X) are not viewers: they do not count.
  const ua = request.headers.get("user-agent") ?? "";
  const result = await fetchMiniature(params.id, { countView: !isbot(ua) });
  if (result.kind === "missing") throw data({ hidden: false }, { status: 404 });
  if (result.kind === "hidden") throw data({ hidden: true }, { status: 404 });

  const { item } = result;
  const lang = detectLang(request);
  // Dates and numbers are formatted here, once: Node's and the browser's ICU data differ.
  const views = translate(lang, `m.views.${pluralCategory(lang, item.views)}` as MessageKey, {
    count: formatNumber(lang, item.views),
  });
  return {
    item,
    text: {
      published: formatDate(lang, item.created_at),
      strokes: formatNumber(lang, item.stroke_count),
      views,
    },
  };
}

function preview(text: string | null, fallback: string) {
  const s = (text ?? "").replace(/\s+/g, " ").trim();
  if (!s) return fallback;
  return [...s].length > DESCRIPTION_PREVIEW ? `${[...s].slice(0, DESCRIPTION_PREVIEW - 1).join("")}…` : s;
}

/** Open Graph and Twitter Card tags (spec section 6), so a pasted link shows the card. */
export function meta({ loaderData, matches }: Route.MetaArgs) {
  const rootLang = (matches[0]?.data as { lang?: unknown } | undefined)?.lang;
  const lang = isLang(rootLang) ? rootLang : "en";
  if (!loaderData) return [{ title: translate(lang, "error.notFoundTitle") }, { name: "robots", content: "noindex" }];

  const { item } = loaderData;
  const title = translate(lang, "m.metaTitle", { title: item.title });
  const description = preview(item.description, translate(lang, "site.description"));
  return [
    { title },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: item.url },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Miniature Workshop" },
    { property: "og:title", content: item.title },
    { property: "og:description", content: description },
    { property: "og:url", content: item.url },
    { property: "og:image", content: item.files.og },
    { property: "og:image:type", content: "image/png" },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: item.title },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: item.title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: item.files.og },
  ];
}

type RootData = { links?: { steam: string | null; discord: string | null } };

const BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-line px-4 text-sm font-medium hover:border-muted";
const PRIMARY =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-5 text-sm font-medium text-surface hover:opacity-90";

export default function MiniaturePage({ loaderData }: Route.ComponentProps) {
  const t = useT();
  const { item, text } = loaderData;
  const links = (useRouteLoaderData("root") as RootData | undefined)?.links;
  const workshop = item.owner.name
    ? t("workshop.named", { name: item.owner.name })
    : t("workshop.anonymous", { id: item.owner.collection_id });

  return (
    <article className="mx-auto max-w-screen-2xl lg:grid lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-10 lg:px-4 lg:py-6">
      {/* Phones: the viewer fills the first screen under the header; details follow on scroll. */}
      <div className="h-[calc(100svh-3.5rem)] bg-raised lg:sticky lg:top-20 lg:h-[calc(100svh-7rem)] lg:overflow-hidden lg:rounded-xl">
        <MiniatureViewer
          title={item.title}
          glb={item.files.glb}
          card={item.files.card}
          thumb400={item.files.thumb_400}
          thumb800={item.files.thumb_800}
        />
      </div>

      <div className="px-4 pb-16 pt-6 lg:px-0 lg:pt-2">
        <Link to="/gallery" className="text-sm text-muted hover:text-ink">
          ← {t("m.backToGallery")}
        </Link>
        <h1 className="mt-3 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{item.title}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          <Link to={`/c/${item.owner.collection_id}`} className="text-ink underline-offset-4 hover:underline">
            {workshop}
          </Link>
          <span aria-hidden="true">·</span>
          <time dateTime={item.created_at}>{t("m.published", { date: text.published })}</time>
          <span aria-hidden="true">·</span>
          <span>{text.views}</span>
        </p>

        {item.description && (
          <p className="mt-4 whitespace-pre-line text-base leading-relaxed">{item.description}</p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <ShareButton title={item.title} url={item.url} className={PRIMARY} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {links?.steam && (
            <a href={links.steam} rel="noopener" className={BUTTON}>
              {t("m.wishlist")}
            </a>
          )}
          {links?.discord && (
            <a href={links.discord} rel="noopener" className={BUTTON}>
              {t("m.discord")}
            </a>
          )}
          <a href={`/m/${item.id}/model.glb`} download className={BUTTON}>
            {t("m.downloadGlb")}
          </a>
          {/* Reports (spec section 7) arrive with POST /api/v1/reports; disabled until then. */}
          <button type="button" disabled title={t("m.reportSoon")} className={`${BUTTON} cursor-not-allowed opacity-50`}>
            {t("m.report")}
          </button>
        </div>

        <MiniatureSpecs item={item} strokes={text.strokes} />
      </div>
    </article>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const t = useT();
  const hidden = isRouteErrorResponse(error) && (error.data as { hidden?: boolean } | null)?.hidden;
  if (!isRouteErrorResponse(error)) console.error(error);
  const titleKey = hidden ? "m.hiddenTitle" : isRouteErrorResponse(error) ? "error.notFoundTitle" : "error.genericTitle";
  const textKey = hidden ? "m.hiddenText" : isRouteErrorResponse(error) ? "error.notFoundText" : "error.genericText";
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">{t(titleKey)}</h1>
      <p className="mt-3 text-muted">{t(textKey)}</p>
      <Link to="/gallery" className="mt-8 inline-block rounded-full bg-raised px-5 py-2.5 hover:bg-line">
        {t("error.backToGallery")}
      </Link>
    </div>
  );
}
