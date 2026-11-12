import { useEffect } from "react";
import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
  useRouteLoaderData,
} from "react-router";
import type { Route } from "./+types/root";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";
import { markHydrated } from "./lib/hydration";
import { useT } from "./lib/i18n";
import { detectLang } from "./lib/i18n.server";
import { env } from "./lib/env.server";
import { useNonce } from "./lib/nonce";
import "./app.css";

export async function loader({ request }: Route.LoaderArgs) {
  return {
    lang: detectLang(request),
    filesOrigin: env.filesOrigin,
    links: { steam: env.steamStoreUrl, discord: env.discordUrl },
  };
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>("root");
  const nonce = useNonce();
  return (
    <html lang={data?.lang ?? "en"}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0e0e10" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        {data?.filesOrigin && <link rel="preconnect" href={data.filesOrigin} />}
        <Meta />
        <Links />
      </head>
      <body className="min-h-dvh">
        {children}
        <ScrollRestoration nonce={nonce} />
        <Scripts nonce={nonce} />
      </body>
    </html>
  );
}

export default function App() {
  useEffect(() => markHydrated(), []);
  // The admin panel has its own header (routes/admin/layout.tsx).
  const isAdmin = useLocation().pathname.startsWith("/admin");
  if (isAdmin) return <Outlet />;
  return (
    <>
      <SiteHeader />
      <main id="content">
        <Outlet />
      </main>
      <SiteFooter />
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const t = useT();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  if (!notFound) console.error(error);
  return (
    <>
      <SiteHeader />
      <main id="content" className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">
          {t(notFound ? "error.notFoundTitle" : "error.genericTitle")}
        </h1>
        <p className="mt-3 text-muted">{t(notFound ? "error.notFoundText" : "error.genericText")}</p>
        <Link to="/gallery" className="mt-8 inline-block rounded-full bg-raised px-5 py-2.5 hover:bg-line">
          {t("error.backToGallery")}
        </Link>
      </main>
    </>
  );
}
