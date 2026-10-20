import type { Config } from "@react-router/dev/config";

export default {
  // Server rendering: link-preview bots (Discord, Telegram) do not run JS, and the
  // first gallery page in the HTML is what makes the 1.5 s on 4G budget realistic.
  ssr: true,
  // Opt in to React Router v8 behaviour now, so the later upgrade is a version bump.
  future: {
    v8_middleware: true,
    v8_splitRouteModules: true,
    v8_viteEnvironmentApi: true,
    v8_passThroughRequests: true,
    v8_trailingSlashAwareDataRequests: true,
  },
} satisfies Config;
