import { Link } from "react-router";
import { useT } from "../lib/i18n";

const LINK = "inline-flex min-h-11 items-center hover:text-ink";

export function SiteFooter() {
  const t = useT();
  return (
    <footer className="border-t border-line">
      <nav
        aria-label={t("footer.label")}
        className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-x-6 px-4 py-3 text-sm text-muted"
      >
        <Link to="/gallery" className={LINK}>
          {t("nav.gallery")}
        </Link>
        <Link to="/privacy" className={LINK}>
          {t("footer.privacy")}
        </Link>
        <Link to="/terms" className={LINK}>
          {t("footer.terms")}
        </Link>
      </nav>
    </footer>
  );
}
