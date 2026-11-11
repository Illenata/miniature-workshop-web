import { redirect } from "react-router";
import { env } from "./env.server";

/**
 * Admin session on the page server. The browser holds only an HttpOnly cookie with the
 * session token; every admin request is checked against the API, which owns the sessions.
 * The cookie is never readable by scripts and is SameSite=Strict, so other sites cannot
 * make the browser act as the admin. Its path is "/" rather than "/admin" because the
 * router loads page data from URLs like /admin.data, which a /admin path would not cover.
 */
const COOKIE = "mw_admin";

function cookieAttributes(maxAgeSeconds: number) {
  const secure = env.publicOrigin.startsWith("https://") ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}

export function sessionCookie(token: string, expiresAt: string): string {
  const maxAge = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  return `${COOKIE}=${token}; ${cookieAttributes(maxAge)}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE}=; ${cookieAttributes(0)}`;
}

function readToken(request: Request): string | null {
  const header = request.headers.get("Cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return v.join("=") || null;
  }
  return null;
}

/** Call to the admin backend; `token` is the session token from the cookie. */
export function adminFetch(path: string, init: RequestInit & { token?: string | null; forwardedFor?: string | null } = {}) {
  const { token, forwardedFor, headers, ...rest } = init;
  return fetch(`${env.apiUrl}/internal/admin${path}`, {
    ...rest,
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(forwardedFor ? { "X-Forwarded-For": forwardedFor } : {}),
      ...headers,
    },
    signal: AbortSignal.timeout(8000),
  });
}

export type AdminSession = { token: string; expiresAt: string };

/** The current admin session, or null. */
export async function getAdminSession(request: Request): Promise<AdminSession | null> {
  const token = readToken(request);
  if (!token) return null;
  const res = await adminFetch("/session", { token });
  if (!res.ok) return null;
  const body = (await res.json()) as { expires_at: string };
  return { token, expiresAt: body.expires_at };
}

/**
 * Every admin loader and action starts with this: route loaders run in parallel, so a
 * check in the layout alone would not protect the routes inside it.
 */
export async function requireAdmin(request: Request): Promise<AdminSession> {
  const session = await getAdminSession(request);
  if (!session) throw redirect("/admin/login", { headers: { "Set-Cookie": clearSessionCookie() } });
  return session;
}

/**
 * Admin forms only accept posts that come from our own pages. Browsers always send
 * Origin on a POST, so a missing or foreign Origin means the request did not start here.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("Origin");
  const allowed = new Set([env.publicOrigin, new URL(request.url).origin]);
  if (!origin || !allowed.has(origin)) throw new Response("Forbidden", { status: 403 });
}

/** Dates in the admin panel: the moderator works in Kyiv time. Formatted on the server only. */
const KYIV = new Intl.DateTimeFormat("uk-UA", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Kyiv" });
export function kyivDateTime(iso: string): string {
  return KYIV.format(new Date(iso));
}
