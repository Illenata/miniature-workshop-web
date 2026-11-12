import { data, Link } from "react-router";
import type { Route } from "./+types/journal";
import { actionName } from "../../lib/admin-action-names";
import { ADMIN_HEADERS } from "../../lib/admin-meta";
import { adminFetch, kyivDateTime, requireAdmin } from "../../lib/admin.server";

export const headers = () => ADMIN_HEADERS;

type ApiAction = { id: number; actor: string; action: string; target: string; created_at: string };
type ApiList = { items: ApiAction[]; next_before: number | null };

const TABS = [
  { key: "all", label: "Усі" },
  { key: "moderation", label: "Модерація" },
  { key: "logins", label: "Входи" },
] as const;
type Tab = (typeof TABS)[number]["key"];
const tabUrl = (tab: Tab) => (tab === "all" ? "/admin/journal" : `/admin/journal?filter=${tab}`);

export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireAdmin(request);
  const url = new URL(request.url);
  const tab: Tab = TABS.find((t) => t.key === url.searchParams.get("filter"))?.key ?? "all";
  const before = url.searchParams.get("before");

  const qs = new URLSearchParams({ filter: tab });
  if (before) qs.set("before", before);
  const res = await adminFetch(`/journal?${qs}`, { token: session.token });
  if (!res.ok) throw data(null, { status: 502 });
  const list = (await res.json()) as ApiList;

  return {
    tab,
    paged: Boolean(before),
    nextBefore: list.next_before,
    actions: list.items.map((a) => ({
      id: a.id,
      name: actionName(a.action),
      target: a.target,
      at: kyivDateTime(a.created_at),
      iso: a.created_at,
    })),
  };
}

const PAGE_LINK = "min-h-10 rounded-full border border-line px-4 py-2 text-sm hover:border-muted";

export default function AdminJournal({ loaderData }: Route.ComponentProps) {
  const { tab, actions, nextBefore, paged } = loaderData;

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Журнал</h1>
      <p className="mt-1 text-sm text-muted">Усі дії в адмінці, найновіші вгорі, по 50 на сторінці.</p>
      <nav aria-label="Фільтр" className="mt-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            to={tabUrl(t.key)}
            aria-current={t.key === tab ? "page" : undefined}
            className={`inline-flex min-h-10 items-center rounded-full border px-4 text-sm ${
              t.key === tab ? "border-ink bg-ink font-medium text-surface" : "border-line text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {actions.length === 0 ? (
        <p className="py-12 text-muted">Тут порожньо.</p>
      ) : (
        <table className="mt-4 w-full max-w-3xl text-left text-sm">
          <thead className="text-muted">
            <tr>
              <th scope="col" className="border-b border-line py-2 pr-4 font-normal">Коли (Київ)</th>
              <th scope="col" className="border-b border-line py-2 pr-4 font-normal">Дія</th>
              <th scope="col" className="border-b border-line py-2 font-normal">Об'єкт</th>
            </tr>
          </thead>
          <tbody>
            {actions.map((a) => (
              <tr key={a.id} className="align-top">
                <td className="border-b border-line py-2 pr-4">
                  <time dateTime={a.iso}>{a.at}</time>
                </td>
                <td className="border-b border-line py-2 pr-4">{a.name}</td>
                <td className="border-b border-line py-2 break-words text-muted [overflow-wrap:anywhere]">{a.target}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-6 flex gap-3">
        {paged && (
          <Link to={tabUrl(tab)} className={PAGE_LINK}>
            На початок
          </Link>
        )}
        {nextBefore && (
          <Link
            to={`/admin/journal?${new URLSearchParams({ ...(tab === "all" ? {} : { filter: tab }), before: String(nextBefore) })}`}
            className={PAGE_LINK}
          >
            Старіші
          </Link>
        )}
      </div>
    </>
  );
}
