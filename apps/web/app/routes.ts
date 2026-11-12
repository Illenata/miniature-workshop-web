import { index, layout, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("gallery", "routes/gallery.tsx"),
  route("c/:id", "routes/collection.tsx"),
  route("c/:id/qr.png", "routes/collection-qr.ts"),
  route("m/:id", "routes/miniature.tsx"),
  route("m/:id/report", "routes/miniature-report.tsx"),
  route("m/:id/qr.png", "routes/miniature-qr.ts"),
  route("m/:id/model.glb", "routes/miniature-glb.ts"),
  route("m/:id/card.png", "routes/miniature-card.ts"),
  route("admin/login", "routes/admin/login.tsx"),
  route("admin/logout", "routes/admin/logout.ts"),
  route("admin/miniatures/:id/thumb.webp", "routes/admin/miniature-thumb.ts"),
  layout("routes/admin/layout.tsx", [
    route("admin", "routes/admin/home.tsx"),
    route("admin/miniatures", "routes/admin/miniatures.tsx"),
    route("admin/reports", "routes/admin/reports.tsx"),
    route("admin/stop-words", "routes/admin/stop-words.tsx"),
    route("admin/stats", "routes/admin/stats.tsx"),
    route("admin/journal", "routes/admin/journal.tsx"),
    route("admin/collections", "routes/admin/collections.tsx"),
  ]),
  route("lang", "routes/lang.ts"),
  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
