import { useEffect, useSyncExternalStore, type RefObject } from "react";

/**
 * Decides which 3D tiles may hold a loaded model (spec section 6): only tiles in the
 * viewport, at most MAX_LOADED at once. A tile that scrolls out gives its slot back and
 * its model is unmounted, so memory stays flat however far a phone user scrolls.
 * Tiles already holding a slot keep it while visible, so models do not flicker.
 */
export const MAX_LOADED = 4;

const elements = new Map<string, Element>();
const visible = new Set<string>();
let granted = new Set<string>();
const listeners = new Set<() => void>();
let observer: IntersectionObserver | null = null;

function inDocumentOrder(a: string, b: string) {
  const ea = elements.get(a);
  const eb = elements.get(b);
  if (!ea || !eb) return 0;
  return ea.compareDocumentPosition(eb) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

function recompute() {
  const next = new Set([...granted].filter((id) => visible.has(id)));
  for (const id of [...visible].sort(inDocumentOrder)) {
    if (next.size >= MAX_LOADED) break;
    next.add(id);
  }
  const changed = next.size !== granted.size || [...next].some((id) => !granted.has(id));
  if (!changed) return;
  granted = next;
  for (const l of listeners) l();
}

function getObserver() {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const id = (e.target as HTMLElement).dataset.slotId;
        if (!id) continue;
        if (e.isIntersecting) visible.add(id);
        else visible.delete(id);
      }
      recompute();
    },
    // "In the viewport" means at least a quarter of the tile is on screen.
    { threshold: 0.25 },
  );
  return observer;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Observe a tile while `active`; returns whether it currently may load its model. */
export function useModelSlot(id: string, ref: RefObject<HTMLElement | null>, active: boolean): boolean {
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    el.dataset.slotId = id;
    elements.set(id, el);
    const obs = getObserver();
    obs.observe(el);
    return () => {
      obs.unobserve(el);
      elements.delete(id);
      visible.delete(id);
      recompute();
    };
  }, [id, ref, active]);

  return useSyncExternalStore(
    subscribe,
    () => active && granted.has(id),
    () => false,
  );
}
