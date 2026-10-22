import { useCallback, useEffect, useState } from "react";
import { useT } from "../lib/i18n";
import { loadModelViewer, usePrefersReducedMotion } from "../lib/model-viewer";

/** Delay after page load before 3D starts on its own (any interaction starts it sooner). */
const AUTO_START_MS = 3500;

type Props = {
  title: string;
  glb: string;
  card: string;
  thumb400: string;
  thumb800: string;
};

/**
 * The miniature page viewer (spec section 6).
 *
 * The card thumbnail is server-rendered as a plain <img>: it is the first thing on screen
 * and the LCP element, so it does not wait for model-viewer's JavaScript. The model
 * renders on top once loaded, and the image is hidden then. In "Card" mode the full-size
 * card (1200×1600) takes the same place; it is only downloaded when that mode is chosen.
 */
export function MiniatureViewer({ title, glb, card, thumb400, thumb800 }: Props) {
  const t = useT();
  const reducedMotion = usePrefersReducedMotion();
  const [mode, setMode] = useState<"3d" | "card">("3d");
  const [modelLoaded, setModelLoaded] = useState(false);

  // The 3D library (~290 KB gzip, mostly three.js) costs about half a second of main-thread
  // work on a mid-range phone. It starts on the viewer's first interaction (scroll, touch,
  // key) or a short while after the page has loaded, whichever comes first, so the card
  // (LCP) and first input are never blocked by it.
  useEffect(() => {
    let started = false;
    let timer: number | undefined;
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    const start = () => {
      if (started) return;
      started = true;
      for (const e of events) window.removeEventListener(e, start);
      void loadModelViewer();
    };
    const onLoad = () => {
      timer = window.setTimeout(start, AUTO_START_MS);
    };
    for (const e of events) window.addEventListener(e, start, { once: true, passive: true });
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => {
      for (const e of events) window.removeEventListener(e, start);
      window.removeEventListener("load", onLoad);
      window.clearTimeout(timer);
    };
  }, []);

  const viewerRef = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const onLoad = () => setModelLoaded(true);
    el.addEventListener("load", onLoad);
    // Already loaded (e.g. cached and fired before this ref attached).
    if ((el as HTMLElement & { loaded?: boolean }).loaded) setModelLoaded(true);
    return () => el.removeEventListener("load", onLoad);
  }, []);

  const showPoster = mode === "card" || !modelLoaded;

  return (
    <div className="relative h-full w-full" aria-label={t("m.viewerLabel")} role="region">
      {mode === "3d" && (
        <img
          src={thumb800}
          srcSet={`${thumb400} 400w, ${thumb800} 800w`}
          sizes="(min-width: 1024px) 50vw, 100vw"
          alt={title}
          fetchPriority="high"
          decoding="async"
          className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${
            showPoster ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
      {mode === "card" && (
        <img
          src={card}
          alt={title}
          decoding="async"
          className="absolute inset-0 h-full w-full object-contain p-3"
        />
      )}

      <model-viewer
        ref={viewerRef}
        src={glb}
        alt={title}
        loading="eager"
        reveal="auto"
        camera-controls
        // Vertical swipes still scroll the page on phones; horizontal drags rotate.
        touch-action="pan-y"
        auto-rotate={reducedMotion ? undefined : true}
        auto-rotate-delay={3000}
        rotation-per-second="20deg"
        // Front of the miniature faces +Z; start slightly above, from the front.
        camera-orbit="0deg 75deg 105%"
        min-camera-orbit="auto 20deg 75%"
        max-camera-orbit="auto 100deg 220%"
        interaction-prompt="auto"
        environment-image="neutral"
        shadow-intensity={1}
        shadow-softness={0.9}
        exposure={1}
        ar
        ar-modes="webxr scene-viewer quick-look"
        ar-scale="fixed"
        ar-placement="floor"
        className={`absolute inset-0 block h-full w-full ${mode === "card" ? "invisible" : ""}`}
      >
        <button
          slot="ar-button"
          type="button"
          className="absolute bottom-4 right-4 min-h-11 rounded-full bg-ink px-4 text-sm font-medium text-surface shadow"
        >
          {t("m.ar")}
        </button>
      </model-viewer>

      <div
        role="group"
        aria-label={t("view.label")}
        className="absolute left-3 top-3 inline-flex rounded-full border border-line bg-surface/80 p-0.5 backdrop-blur"
      >
        {(["3d", "card"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={`min-h-9 min-w-12 rounded-full px-3 text-sm ${
              mode === m ? "bg-ink font-medium text-surface" : "text-muted hover:text-ink"
            }`}
          >
            {t(m === "3d" ? "view.3d" : "view.card")}
          </button>
        ))}
      </div>

      {mode === "3d" && !modelLoaded && (
        <p className="pointer-events-none absolute bottom-4 left-4 rounded-full bg-surface/80 px-3 py-1 text-xs text-muted">
          {t("m.loading3d")}
        </p>
      )}
    </div>
  );
}
