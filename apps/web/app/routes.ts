import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("gallery", "routes/gallery.tsx"),
  route("m/:id", "routes/miniature.tsx"),
  route("m/:id/report", "routes/miniature-report.tsx"),
  route("m/:id/qr.png", "routes/miniature-qr.ts"),
  route("m/:id/model.glb", "routes/miniature-glb.ts"),
  route("m/:id/card.png", "routes/miniature-card.ts"),
  route("lang", "routes/lang.ts"),
  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
