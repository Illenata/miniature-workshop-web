import { Form, NavLink, Outlet } from "react-router";
import type { Route } from "./+types/layout";
import { requireAdmin } from "../../lib/admin.server";
import { ADMIN_HEADERS, ADMIN_META } from "../../lib/admin-meta";

export const meta = () => ADMIN_META;
export const headers = () => ADMIN_HEADERS;

export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireAdmin(request);
  // Formatted here once (server and browser ICU data differ); the moderator works in Kyiv time.
  const until = new Intl.DateTimeFormat("uk-UA", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv" }).format(
    new Date(session.expiresAt),
  );
  return { sessionUntil: until };
}

/** Sections arrive step by step; the ones not built yet are listed but not linked. */
const SECTIONS: { name: string; to?: string }[] = [
  { name: "Мініатюри", to: "/admin/miniatures" },
  { name: "Скарги", to: "/admin/reports" },
  { name: "Колекції", to: "/admin/collections" },
  { name: "Стоп-слова" },
  { name: "Статистика" },
  { name: "Журнал" },
];

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto max-w-screen-xl px-4">
          <div className="flex items-center gap-3 py-3">
            <NavLink to="/admin" className="mr-auto font-semibold tracking-tight">
              Адмінка
            </NavLink>
            <span className="text-xs text-muted">Сесія до {loaderData.sessionUntil} (Київ)</span>
            <Form method="post" action="/admin/logout">
              <button type="submit" className="min-h-9 rounded-full border border-line px-4 text-sm hover:border-muted">
                Вийти
              </button>
            </Form>
          </div>
          {/* One row that scrolls sideways on a phone instead of wrapping into a column. */}
          <nav aria-label="Розділи" className="-mx-4 flex gap-5 overflow-x-auto px-4 pb-3 text-sm whitespace-nowrap text-muted">
            {SECTIONS.map(({ name, to }) =>
              to ? (
                <NavLink key={name} to={to} className={({ isActive }) => (isActive ? "font-medium text-ink" : "hover:text-ink")}>
                  {name}
                </NavLink>
              ) : (
                <span key={name} aria-disabled="true" title="Скоро" className="opacity-50">
                  {name}
                </span>
              ),
            )}
          </nav>
        </div>
      </header>
      <main id="content" className="mx-auto max-w-screen-xl px-4 py-6">
        <Outlet />
      </main>
    </>
  );
}
