/**
 * True once the first client render has hydrated. Before that, components must render
 * exactly what the server rendered, so browser-only state (sessionStorage) is read only
 * on later client-side navigations.
 */
let hydrated = false;

export function markHydrated() {
  hydrated = true;
}

export function isHydrated() {
  return hydrated;
}
