import { useSyncExternalStore } from "react";

let loading: Promise<unknown> | null = null;

/**
 * model-viewer (with three.js, ~1 MB) is bundled and served from our own origin
 * (no third-party CDN, spec section 3) and downloaded only when 3D mode is first used.
 */
export function loadModelViewer() {
  loading ??= import("@google/model-viewer");
  return loading;
}

const QUERY = "(prefers-reduced-motion: reduce)";

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(QUERY);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
