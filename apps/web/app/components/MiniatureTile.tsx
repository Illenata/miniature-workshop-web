import { Link } from "react-router";
import type { Tile } from "../lib/tiles";
import { useT } from "../lib/i18n";

/**
 * Tile widths in the grid, matching the column classes in GalleryGrid:
 * 2 columns on phones, 3 from 640 px, 4 from 1024, 5 from 1280, 6 from 1536 (max width).
 */
export const TILE_SIZES = [
  "(min-width: 1536px) 240px",
  "(min-width: 1280px) calc((100vw - 80px) / 5)",
  "(min-width: 1024px) calc((100vw - 68px) / 4)",
  "(min-width: 640px) calc((100vw - 56px) / 3)",
  "calc((100vw - 44px) / 2)", // 16 px gutters + 12 px gap
].join(", ");

type Props = {
  tile: Tile;
  /** Above-the-fold tiles load immediately; the very first ones get high priority (LCP). */
  priority: "high" | "eager" | "lazy";
};

export function MiniatureTile({ tile, priority }: Props) {
  const t = useT();
  const workshop = tile.ownerName
    ? t("workshop.named", { name: tile.ownerName })
    : t("workshop.anonymous", { id: tile.collectionId });

  return (
    <li>
      <Link to={`/m/${tile.id}`} prefetch="none" className="group block rounded-lg">
        <div className="aspect-[3/4] overflow-hidden rounded-lg bg-raised">
          <img
            src={tile.thumb400}
            srcSet={`${tile.thumb400} 400w, ${tile.thumb800} 800w`}
            sizes={TILE_SIZES}
            width={400}
            height={533}
            alt={tile.title}
            loading={priority === "lazy" ? "lazy" : "eager"}
            fetchPriority={priority === "high" ? "high" : "auto"}
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
          />
        </div>
        <div className="mt-2 min-w-0 px-0.5">
          {/* The title is already the image's alt text; hidden here to avoid reading it twice. */}
          <p aria-hidden="true" className="truncate text-sm font-medium leading-snug">
            {tile.title}
          </p>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted">
            {tile.faction && (
              <span
                className={`shrink-0 font-medium ${tile.faction === "gilded" ? "text-gilded" : "text-painted"}`}
              >
                {t(`faction.${tile.faction}`)}
              </span>
            )}
            {tile.faction && <span aria-hidden="true">·</span>}
            <span className="truncate">{workshop}</span>
          </p>
        </div>
      </Link>
    </li>
  );
}
