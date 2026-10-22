import { useEffect, useSyncExternalStore, type RefObject } from "react";

/**
 * Decides which 3D tiles show a live model.
 *
 * Budget: how many models may be loaded at once. The spec's floor is 4 (section 6);
 * devices that can afford more get enough to cover every tile on screen:
 *   data saver or 2G/3G ............ 4
 *   phone / narrow screen .......... 6 (2 columns × 3 rows), 4 with < 4 GB RAM
 *   desktop ........................ 12, or 24 with ≥ 8 GB RAM
 *
 * Within the budget, models go to tiles in the viewport, top to bottom. Downloads run
 * at most DOWNLOAD_CONCURRENCY at a time (in that order), so the first rows turn 3D
 * quickly and parsing/texture upload does not stall scrolling. A tile keeps its model
 * while it stays near the viewport (half a screen of margin) and unloads it beyond that,
 * so a little scrolling back and forth does not re-download, and memory stays flat.
 */
export const SPEC_MIN_LOADED = 4;
export const DOWNLOAD_CONCURRENCY = 2;

export type ModelState = "poster" | "loading" | "ready";

type NavigatorHints = Navigator & {
  connection?: { saveData?: boolean; effectiveType?: string };
  deviceMemory?: number;
};

export function computeBudget(
  nav: NavigatorHints = navigator,
  wide = window.matchMedia("(min-width: 1024px)").matches,
): number {
  const conn = nav.connection;
  if (conn?.saveData) return SPEC_MIN_LOADED;
  if (conn?.effectiveType && ["slow-2g", "2g", "3g"].includes(conn.effectiveType)) return SPEC_MIN_LOADED;
  const memoryGb = nav.deviceMemory ?? 4; // Safari and Firefox do not report it
  if (!wide) return memoryGb >= 4 ? 6 : SPEC_MIN_LOADED;
  return memoryGb >= 8 ? 24 : 12;
}

const elements = new Map<string, Element>();
const visible = new Set<string>(); // at least a quarter on screen: may get a model
const near = new Set<string>(); // within half a screen: may keep its model
let slots = new Set<string>(); // allowed to hold a model
const downloading = new Set<string>();
const ready = new Set<string>();
const listeners = new Set<() => void>();
let budget: number | null = null;
let visibleObserver: IntersectionObserver | null = null;
let nearObserver: IntersectionObserver | null = null;

function inDocumentOrder(a: string, b: string) {
  const ea = elements.get(a);
  const eb = elements.get(b);
  if (!ea || !eb) return 0;
  return ea.compareDocumentPosition(eb) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

function notify() {
  for (const l of listeners) l();
}

function recompute() {
  budget ??= computeBudget();
  const next = new Set([...slots].filter((id) => near.has(id)));
  for (const id of [...visible].sort(inDocumentOrder)) {
    if (next.size >= budget) break;
    next.add(id);
  }
  for (const id of slots) {
    if (!next.has(id)) {
      downloading.delete(id);
      ready.delete(id);
    }
  }
  slots = next;
  // Start downloads in page order while there is room.
  const waiting = [...slots].filter((id) => !downloading.has(id) && !ready.has(id)).sort(inDocumentOrder);
  for (const id of waiting) {
    if (downloading.size >= DOWNLOAD_CONCURRENCY) break;
    downloading.add(id);
  }
  notify();
}

function observers() {
  const handle = (set: Set<string>) => (entries: IntersectionObserverEntry[]) => {
    for (const e of entries) {
      const id = (e.target as HTMLElement).dataset.slotId;
      if (!id) continue;
      if (e.isIntersecting) set.add(id);
      else set.delete(id);
    }
    recompute();
  };
  // isIntersecting is true for any overlap, so "visible" is decided by the ratio itself.
  visibleObserver ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const id = (e.target as HTMLElement).dataset.slotId;
        if (!id) continue;
        if (e.isIntersecting && e.intersectionRatio >= 0.25) visible.add(id);
        else visible.delete(id);
      }
      recompute();
    },
    { threshold: [0, 0.25] },
  );
  nearObserver ??= new IntersectionObserver(handle(near), { rootMargin: "50% 0px" });
  return [visibleObserver, nearObserver] as const;
}

/** Called by a tile when its model finished loading (or failed): frees a download. */
export function markModelSettled(id: string) {
  if (!downloading.delete(id)) return;
  if (slots.has(id)) ready.add(id);
  recompute();
}


function stateOf(id: string): ModelState {
  if (ready.has(id)) return "ready";
  if (downloading.has(id)) return "loading";
  return "poster";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Observe a tile while `active`; returns whether it shows its poster or a (loading) model. */
export function useModelSlot(id: string, ref: RefObject<HTMLElement | null>, active: boolean): ModelState {
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    el.dataset.slotId = id;
    elements.set(id, el);
    const obs = observers();
    for (const o of obs) o.observe(el);
    return () => {
      for (const o of obs) o.unobserve(el);
      elements.delete(id);
      visible.delete(id);
      near.delete(id);
      recompute();
    };
  }, [id, ref, active]);

  return useSyncExternalStore(
    subscribe,
    () => (active ? stateOf(id) : "poster"),
    () => "poster",
  );
}
