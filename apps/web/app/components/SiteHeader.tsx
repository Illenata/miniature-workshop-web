import { Form, Link, NavLink, useLocation } from "react-router";
import { LANGS, useLang, useT } from "../lib/i18n";

export function SiteHeader() {
  const t = useT();
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:rounded focus:bg-raised focus:px-3 focus:py-2"
      >
        {t("nav.skipToContent")}
      </a>
      <div className="mx-auto flex h-14 max-w-screen-2xl items-center gap-4 px-4">
        <Link to="/" className="font-semibold tracking-tight">
          {t("site.name")}
        </Link>
        <nav className="flex-1">
          <NavLink
            to="/gallery"
            className={({ isActive }) =>
              `text-sm ${isActive ? "text-ink" : "text-muted hover:text-ink"}`
            }
          >
            {t("nav.gallery")}
          </NavLink>
        </nav>
        <LanguageSwitcher />
      </div>
    </header>
  );
}

/** A form, not JS: switching language works before hydration and without JS. */
function LanguageSwitcher() {
  const t = useT();
  const current = useLang();
  const location = useLocation();
  const back = `${location.pathname}${location.search}`;
  return (
    <Form method="post" action="/lang" className="flex text-xs" aria-label={t("lang.label")}>
      <input type="hidden" name="redirectTo" value={back} />
      {LANGS.map((lang) => (
        <button
          key={lang}
          type="submit"
          name="lang"
          value={lang}
          aria-pressed={lang === current}
          lang={lang}
          title={t(`lang.${lang}`)}
          className={`min-h-10 min-w-10 rounded px-2 uppercase ${
            lang === current ? "text-ink font-semibold" : "text-muted hover:text-ink"
          }`}
        >
          {lang}
        </button>
      ))}
    </Form>
  );
}
