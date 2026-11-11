/** Shared by every admin route: never cached, never indexed. (Not in admin.server.ts: `meta` also runs in the browser.) */
export const ADMIN_HEADERS = { "Cache-Control": "no-store" };
export const ADMIN_META = [{ title: "Адмінка · Miniature Workshop" }, { name: "robots", content: "noindex, nofollow" }];
