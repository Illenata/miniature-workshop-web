import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  // The React Router plugin builds the app; unit tests (Vitest) only need plain Vite.
  plugins: [tailwindcss(), !process.env.VITEST && reactRouter()],
  // The shared contract ships as TypeScript source, so the server bundle must include it.
  ssr: { noExternal: ["@mw/contract"] },
  server: { port: 5173, strictPort: true },
});
