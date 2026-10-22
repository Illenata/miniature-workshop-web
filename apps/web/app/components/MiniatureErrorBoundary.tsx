import { isRouteErrorResponse, Link, useRouteError, useSearchParams } from "react-router";
import { useT } from "../lib/i18n";

/** 404 for a missing miniature, or "This miniature was hidden" (spec section 4). */
export function MiniatureErrorBoundary() {
  const error = useRouteError();
  const t = useT();
  // The visitor's own report may be the one that hid it: thank them anyway.
  const [search] = useSearchParams();
  const reported = search.get("reported") === "1";
  const hidden = isRouteErrorResponse(error) && (error.data as { hidden?: boolean } | null)?.hidden;
  if (!isRouteErrorResponse(error)) console.error(error);
  const titleKey = hidden ? "m.hiddenTitle" : isRouteErrorResponse(error) ? "error.notFoundTitle" : "error.genericTitle";
  const textKey = hidden ? "m.hiddenText" : isRouteErrorResponse(error) ? "error.notFoundText" : "error.genericText";
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      {reported && (
        <p role="status" className="mb-8 rounded-lg border border-line bg-raised px-4 py-3 text-sm">
          {t("report.thanks")}
        </p>
      )}
      <h1 className="text-2xl font-semibold">{t(titleKey)}</h1>
      <p className="mt-3 text-muted">{t(textKey)}</p>
      <Link to="/gallery" className="mt-8 inline-block rounded-full bg-raised px-5 py-2.5 hover:bg-line">
        {t("error.backToGallery")}
      </Link>
    </div>
  );
}
