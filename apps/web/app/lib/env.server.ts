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
  /** Public origin of the pages; decides whether cookies are Secure and which Origin may POST. */
  publicOrigin: new URL(process.env.PUBLIC_BASE_URL ?? "http://localhost:5173").origin,
  /** Spec appendix C: empty hides the button (the links do not exist yet). */
  steamStoreUrl: process.env.STEAM_STORE_URL?.trim() || null,
  discordUrl: process.env.DISCORD_URL?.trim() || null,
};
