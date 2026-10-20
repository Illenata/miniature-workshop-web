import { useSyncExternalStore } from "react";

/** "Card / 3D" choice for gallery and collection grids, remembered per browser (spec section 6). */
export type ViewMode = "card" | "3d";

const KEY = "mw.gridView";
const listeners = new Set<() => void>();
let current: ViewMode | null = null;

function read(): ViewMode {
  if (current) return current;
  try {
    current = localStorage.getItem(KEY) === "3d" ? "3d" : "card";
  } catch {
    current = "card"; // storage blocked: still works, just not remembered
  }
  return current;
}

export function setViewMode(mode: ViewMode) {
  current = mode;
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // ignore
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Server and hydration render "card" (the HTML never depends on browser storage);
 * a stored "3d" choice applies right after hydration.
 */
export function useViewMode(): ViewMode {
  return useSyncExternalStore(subscribe, read, () => "card");
}
