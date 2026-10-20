/**
 * Server-side settings for the pages. Defaults match local development
 * (API on :3000), so `npm run dev` works without a .env file.
 */
function trimSlash(url: string) {
  return url.replace(/\/+$/, "");
}

export const env = {
  /** How the page server reaches the API (http://api:3000 inside docker compose). */
  apiUrl: trimSlash(process.env.API_INTERNAL_URL ?? "http://localhost:3000"),
  /** Origin of user files; allowed in the Content-Security-Policy. */
  filesOrigin: new URL(process.env.FILES_BASE_URL ?? "http://localhost:3000/files").origin,
  production: process.env.NODE_ENV === "production",
};
