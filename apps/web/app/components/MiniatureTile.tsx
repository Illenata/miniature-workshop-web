import { useCallback, useRef } from "react";
import { Link } from "react-router";
import { useT } from "../lib/i18n";
import { markModelSettled, useModelSlot } from "../lib/model-slots";
import { usePrefersReducedMotion } from "../lib/model-viewer";
import type { Tile } from "../lib/tiles";
import type { ViewMode } from "../lib/view-mode";

/**
 * Tile widths in the grid, matching the column classes in the gallery grid:
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
  mode: ViewMode;
  /** Above-the-fold tiles load immediately; the very first ones get high priority (LCP). */
  priority: "high" | "eager" | "lazy";
};

export function MiniatureTile({ tile, mode, priority }: Props) {
  const t = useT();
  const mediaRef = useRef<HTMLDivElement>(null);
  const modelState = useModelSlot(tile.id, mediaRef, mode === "3d");
  const reducedMotion = usePrefersReducedMotion();
  // model-viewer fires "load" or "error" once the glb is in; that frees a download slot.
  const viewerRef = useCallback(
    (el: HTMLElement | null) => {
      if (!el) return;
      const settle = () => markModelSettled(tile.id);
      el.addEventListener("load", settle, { once: true });
      el.addEventListener("error", settle, { once: true });
      return () => {
        el.removeEventListener("load", settle);
        el.removeEventListener("error", settle);
      };
    },
    [tile.id],
  );

  const workshop = tile.ownerName
    ? t("workshop.named", { name: tile.ownerName })
    : t("workshop.anonymous", { id: tile.collectionId });

  return (
    <li>
      <Link to={`/m/${tile.id}`} prefetch="none" className="group block rounded-lg">
        <div ref={mediaRef} className="relative aspect-[3/4] overflow-hidden rounded-lg bg-raised">
          {modelState !== "poster" ? (
            // In a tile: slow turntable, no camera controls; a tap opens the miniature page.
            <model-viewer
              ref={viewerRef}
              src={tile.glb}
              poster={tile.thumb800}
              alt={tile.title}
              loading="eager"
              reveal="auto"
              auto-rotate={reducedMotion ? undefined : true}
              auto-rotate-delay={0}
              rotation-per-second="18deg"
              camera-orbit="0deg 75deg 105%"
              interaction-prompt="none"
              environment-image="neutral"
              shadow-intensity={0.8}
              className="block h-full w-full"
            />
          ) : (
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
          )}
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
