import { useId } from "react";
import { Form, useNavigate } from "react-router";
import { SORTS, sortSchema, type Faction, type Sort } from "@mw/contract";
import { galleryHref } from "../lib/gallery-params";
import { useT, type MessageKey } from "../lib/i18n";

const LABELS: Record<Sort, MessageKey> = {
  newest: "sort.newest",
  oldest: "sort.oldest",
  title_asc: "sort.title_asc",
  title_desc: "sort.title_desc",
};

/**
 * Native <select> (best on phones, accessible by default) inside a GET form:
 * with JS a change applies at once (canonical URL, default order omitted);
 * without JS the "Apply" button submits the form.
 */
export function SortSelect({ faction, sort }: { faction: Faction | undefined; sort: Sort }) {
  const t = useT();
  const navigate = useNavigate();
  const id = useId();
  return (
    <Form method="get" action="/gallery" className="flex items-center gap-2">
      {faction && <input type="hidden" name="faction" value={faction} />}
      <label htmlFor={id} className="sr-only">
        {t("sort.label")}
      </label>
      <select
        id={id}
        name="sort"
        defaultValue={sort}
        key={sort}
        onChange={(e) => {
          const next = sortSchema.parse(e.currentTarget.value);
          navigate(galleryHref({ faction, sort: next }), { preventScrollReset: true });
        }}
        className="min-h-10 rounded-full border border-line bg-surface px-4 text-sm text-ink hover:border-muted"
      >
        {SORTS.map((s) => (
          <option key={s} value={s}>
            {t(LABELS[s])}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="min-h-10 rounded-full border border-line px-3 text-sm">
          {t("sort.apply")}
        </button>
      </noscript>
    </Form>
  );
}
