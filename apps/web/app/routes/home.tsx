import { Link, useRouteLoaderData } from "react-router";
import { DEFAULT_SORT } from "@mw/contract";
import type { Route } from "./+types/home";
import { MiniatureTile } from "../components/MiniatureTile";
import { GRID_CLASS } from "../components/TileGrid";
import { fetchGalleryPage } from "../lib/api.server";
import { env } from "../lib/env.server";
import { isLang, translate, useT } from "../lib/i18n";
import { detectLang } from "../lib/i18n.server";
import type { Tile } from "../lib/tiles";

/** Spec section 6: the landing page shows the 12 latest miniatures. */
const LATEST_COUNT = 12;

export async function loader({ request }: Route.LoaderArgs) {
  const lang = detectLang(request);
  let latest: Tile[] = [];

  try {
    // The first gallery page (newest first) already holds them; no separate API route.
    const page = await fetchGalleryPage({ sort: DEFAULT_SORT, lang });
    latest = page.tiles.slice(0, LATEST_COUNT);
  } catch (err) {
    // Without the API the page still shows the game and its links.
    console.error(err);
  }

  return { latest, url: `${env.publicOrigin}/` };
}

export function meta({ data, matches }: Route.MetaArgs) {
  const rootLang = (matches[0]?.data as { lang?: unknown } | undefined)?.lang;
  const lang = isLang(rootLang) ? rootLang : "en";
  const title = translate(lang, "home.metaTitle");
  const description = translate(lang, "home.intro");

  return [
    { title },
    { name: "description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: translate(lang, "site.name") },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    ...(data ? [{ property: "og:url", content: data.url }] : []),
    { name: "twitter:card", content: "summary" },
  ];
}

type RootData = { links?: { steam: string | null; discord: string | null } };

const PRIMARY =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-5 text-sm font-medium text-surface hover:opacity-90";
const BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-line px-5 text-sm font-medium hover:border-muted";

export default function Home({ loaderData }: Route.ComponentProps) {
  const t = useT();
  const { latest } = loaderData;
  const links = (useRouteLoaderData("root") as RootData | undefined)?.links;

  return (
    <div className="mx-auto max-w-screen-2xl px-4 pb-16">
      <section className="py-10 sm:py-16">
        {/* The wordmark stands in for the logo until Anton provides one. */}
        <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">{t("site.name")}</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed sm:text-lg">{t("home.intro")}</p>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">{t("home.sharing")}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          {links?.steam ? (
            <a href={links.steam} rel="noopener" className={PRIMARY}>
              {t("m.wishlist")}
            </a>
          ) : null}
          {links?.discord ? (
            <a href={links.discord} rel="noopener" className={BUTTON}>
              {t("m.discord")}
            </a>
          ) : null}
          {/* Primary only while the Steam link does not exist yet. */}
          <Link to="/gallery" className={links?.steam ? BUTTON : PRIMARY}>
            {t("home.openGallery")}
          </Link>
        </div>
      </section>

      {latest.length > 0 ? (
        <section aria-labelledby="latest-heading">
          <div className="mb-5 flex items-baseline justify-between gap-3">
            <h2 id="latest-heading" className="text-xl font-semibold tracking-tight sm:text-2xl">
              {t("home.latest")}
            </h2>
            <Link to="/gallery" className="shrink-0 text-sm text-muted hover:text-ink">
              {t("home.allMiniatures")} →
            </Link>
          </div>
          {/* Five columns would leave two tiles alone in a third row: show ten there. */}
          <ul className={`${GRID_CLASS} xl:max-2xl:[&>li:nth-child(n+11)]:hidden`}>
            {latest.map((tile, index) => (
              <MiniatureTile
                key={tile.id}
                tile={tile}
                mode="card"
                priority={index < 2 ? "high" : index < 6 ? "eager" : "lazy"}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
