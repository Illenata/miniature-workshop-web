import { data, Link, useFetcher } from "react-router";
import type { Route } from "./+types/collections";
import { moderationAction } from "../../lib/admin-actions.server";
import { ADMIN_HEADERS } from "../../lib/admin-meta";
import { adminFetch, kyivDateTime, requireAdmin } from "../../lib/admin.server";

export const headers = () => ADMIN_HEADERS;

type ApiItem = { id: string; name: string | null; status: "active" | "banned"; miniature_count: number; created_at: string };
type ApiList = { items: ApiItem[]; counts: { all: number; banned: number }; next_cursor: string | null };

const TABS = [
  { key: "all", label: "Усі" },
  { key: "banned", label: "Забанені" },
] as const;
type Tab = (typeof TABS)[number]["key"];
const tabUrl = (tab: Tab) => (tab === "all" ? "/admin/collections" : `/admin/collections?status=${tab}`);

export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireAdmin(request);
  const url = new URL(request.url);
  const tab: Tab = TABS.find((t) => t.key === url.searchParams.get("status"))?.key ?? "all";
  const cursor = url.searchParams.get("cursor");

  const qs = new URLSearchParams({ status: tab });
  if (cursor) qs.set("cursor", cursor);
  const res = await adminFetch(`/collections?${qs}`, { token: session.token });
  if (!res.ok) throw data(null, { status: 502 });
  const list = (await res.json()) as ApiList;

  return {
    tab,
    counts: list.counts,
    nextCursor: list.next_cursor,
    paged: Boolean(cursor),
    items: list.items.map((c) => ({
      id: c.id,
      name: c.name ?? `#${c.id}`,
      banned: c.status === "banned",
      miniatures: c.miniature_count,
      createdAt: c.created_at,
      created: kyivDateTime(c.created_at),
    })),
  };
}

export async function action({ request }: Route.ActionArgs) {
  return moderationAction(request);
}

type Row = Route.ComponentProps["loaderData"]["items"][number];

function CollectionRow({ c }: { c: Row }) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  return (
    <li className="flex items-center gap-3 border-b border-line py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {c.banned ? (
            <>Майстерня {c.name}</>
          ) : (
            <Link to={`/c/${c.id}`} className="underline-offset-4 hover:underline">
              Майстерня {c.name}
            </Link>
          )}
        </p>
        <p className="text-sm text-muted">
          {c.banned && <span className="text-red-300">Забанена · </span>}
          Мініатюр: {c.miniatures} · з <time dateTime={c.createdAt}>{c.created}</time>
        </p>
        {fetcher.data?.error && (
          <p role="alert" className="text-sm text-red-300">
            {fetcher.data.error}
          </p>
        )}
      </div>
      <fetcher.Form method="post">
        <input type="hidden" name="id" value={c.id} />
        <button
          type="submit"
          name="intent"
          value={c.banned ? "unban" : "ban"}
          disabled={busy}
          className="min-h-10 min-w-28 rounded-full border border-line px-4 text-sm hover:border-muted disabled:opacity-60"
        >
          {c.banned ? "Розбанити" : "Забанити"}
        </button>
      </fetcher.Form>
    </li>
  );
}

export default function AdminCollections({ loaderData }: Route.ComponentProps) {
  const { tab, counts, items, nextCursor, paged } = loaderData;
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Колекції</h1>
      <p className="mt-1 text-sm text-muted">
        Забанена колекція і всі її мініатюри зникають із сайту, а нові завантаження з її ключа відхиляються. Нічого
        не стирається: «Розбанити» повертає все.
      </p>
      <nav aria-label="Статус" className="mt-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            to={tabUrl(t.key)}
            aria-current={t.key === tab ? "page" : undefined}
            className={`inline-flex min-h-10 items-center rounded-full border px-4 text-sm ${
              t.key === tab ? "border-ink bg-ink font-medium text-surface" : "border-line text-muted hover:text-ink"
            }`}
          >
            {t.label} {counts[t.key]}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <p className="py-12 text-muted">{tab === "banned" ? "Забанених колекцій немає." : "Тут порожньо."}</p>
      ) : (
        <ul className="mt-2">
          {items.map((c) => (
            <CollectionRow key={c.id} c={c} />
          ))}
        </ul>
      )}

      <div className="mt-6 flex gap-3">
        {paged && (
          <Link to={tabUrl(tab)} className="min-h-10 rounded-full border border-line px-4 py-2 text-sm hover:border-muted">
            На початок
          </Link>
        )}
        {nextCursor && (
          <Link
            to={`/admin/collections?${new URLSearchParams({ ...(tab === "all" ? {} : { status: tab }), cursor: nextCursor })}`}
            className="min-h-10 rounded-full border border-line px-4 py-2 text-sm hover:border-muted"
          >
            Старіші
          </Link>
        )}
      </div>
    </>
  );
}
