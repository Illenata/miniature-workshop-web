import { Link } from "react-router";
import type { Faction } from "@mw/contract";
import { useT } from "../lib/i18n";

const OPTIONS = [
  { value: undefined, key: "gallery.filter.all" },
  { value: "painted", key: "gallery.filter.painted" },
  { value: "gilded", key: "gallery.filter.gilded" },
] as const;

/** Plain links: the filter lives in the URL (?faction=), so it is shareable and works without JS. */
export function FactionFilter({ current }: { current: Faction | undefined }) {
  const t = useT();
  return (
    <nav aria-label={t("gallery.filterLabel")}>
      <ul className="flex gap-2">
        {OPTIONS.map((o) => {
          const active = o.value === current;
          return (
            <li key={o.key}>
              <Link
                to={o.value ? `/gallery?faction=${o.value}` : "/gallery"}
                aria-current={active ? "page" : undefined}
                preventScrollReset={false}
                className={`inline-flex min-h-10 items-center rounded-full border px-4 text-sm ${
                  active
                    ? "border-ink bg-ink text-surface font-medium"
                    : "border-line text-muted hover:border-muted hover:text-ink"
                }`}
              >
                {t(o.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
