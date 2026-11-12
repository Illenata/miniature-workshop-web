import { useState } from "react";
import { data, Link, useFetcher } from "react-router";
import type { Route } from "./+types/miniatures";
import { ADMIN_HEADERS } from "../../lib/admin-meta";
import { moderationAction } from "../../lib/admin-actions.server";
import { adminFetch, kyivDateTime, requireAdmin } from "../../lib/admin.server";

export const headers = () => ADMIN_HEADERS;

type Status = "visible" | "hidden" | "removed";
type ApiItem = {
  id: string;
  title: string;
  status: Status;
  hidden_reason: "reports" | "moderator" | null;
  collection: { id: string; name: string | null; status: "active" | "banned" };
  open_reports: number;
  views: number;
  created_at: string;
};
type ApiList = { items: ApiItem[]; counts: Record<"all" | Status, number>; next_cursor: string | null };

const TABS = [
  { key: "all", label: "Усі" },
  { key: "visible", label: "Видимі" },
  { key: "hidden", label: "Сховані" },
  { key: "removed", label: "Видалені" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireAdmin(request);
  const url = new URL(request.url);
  const tab: Tab = TABS.find((t) => t.key === url.searchParams.get("status"))?.key ?? "all";
  const cursor = url.searchParams.get("cursor");

  const qs = new URLSearchParams({ status: tab });
  if (cursor) qs.set("cursor", cursor);
  const res = await adminFetch(`/miniatures?${qs}`, { token: session.token });
  if (!res.ok) throw data(null, { status: 502 });
  const list = (await res.json()) as ApiList;

  return {
    tab,
    counts: list.counts,
    nextCursor: list.next_cursor,
    paged: Boolean(cursor),
    items: list.items.map((m) => ({
      id: m.id,
      title: m.title,
      status: m.status,
      hiddenReason: m.hidden_reason,
      collectionId: m.collection.id,
      workshop: m.collection.name ?? `#${m.collection.id}`,
      banned: m.collection.status === "banned",
      openReports: m.open_reports,
      views: m.views,
      createdAt: m.created_at,
      created: kyivDateTime(m.created_at),
    })),
  };
}

export async function action({ request }: Route.ActionArgs) {
  return moderationAction(request);
}

type Row = Route.ComponentProps["loaderData"]["items"][number];

function statusLabel(m: Row): { text: string; tone: string } {
  if (m.status === "removed") return { text: "Видалена", tone: "text-muted" };
  if (m.status === "hidden") {
    return m.hiddenReason === "reports"
      ? { text: "Схована через скарги", tone: "text-red-300" }
      : { text: "Схована модератором", tone: "text-amber-300" };
  }
  return m.banned ? { text: "Колекцію забанено", tone: "text-red-300" } : { text: "Видима", tone: "text-emerald-300" };
}

const BTN = "min-h-10 rounded-full border border-line px-4 text-sm hover:border-muted disabled:opacity-60";
const BTN_DANGER = "min-h-10 rounded-full border border-red-400/60 px-4 text-sm text-red-300 hover:border-red-300 disabled:opacity-60";

function MiniatureRow({ m }: { m: Row }) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  const [confirming, setConfirming] = useState(false);
  const status = statusLabel(m);
  const publicPage = m.status === "visible" && !m.banned;

  return (
    <li className="border-b border-line py-3">
      <div className="flex items-center gap-3">
        {m.status === "removed" ? (
          <div className="h-16 w-12 shrink-0 rounded bg-raised" aria-hidden="true" />
        ) : (
          <img
            src={`/admin/miniatures/${m.id}/thumb.webp`}
            alt=""
            width={48}
            height={64}
            loading="lazy"
            className="h-16 w-12 shrink-0 rounded bg-raised object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            {publicPage ? (
              <Link to={`/m/${m.id}`} className="underline-offset-4 hover:underline">
                {m.title}
              </Link>
            ) : (
              m.title
            )}
          </p>
          <p className="truncate text-sm text-muted">Майстерня {m.workshop}</p>
          <p className="text-sm">
            <time dateTime={m.createdAt} className="text-muted">
              {m.created}
            </time>
            {" · "}
            <span className={status.tone}>{status.text}</span>
            {m.openReports > 0 && <span className="text-muted"> · скарг: {m.openReports}</span>}
          </p>
        </div>
      </div>

      {fetcher.data?.error && (
        <p role="alert" className="mt-2 text-sm text-red-300">
          {fetcher.data.error}
        </p>
      )}

      {m.status !== "removed" && (
        <fetcher.Form method="post" className="mt-3 flex flex-wrap gap-2" onSubmit={() => setConfirming(false)}>
          {confirming ? (
            <>
              <p className="w-full text-sm">Стерти файли цієї мініатюри назавжди? Повернути їх буде неможливо.</p>
              <button type="submit" name="intent" value="remove" disabled={busy} className={BTN_DANGER}>
                Так, видалити
              </button>
              <button type="button" onClick={() => setConfirming(false)} className={BTN}>
                Скасувати
              </button>
              <input type="hidden" name="id" value={m.id} />
            </>
          ) : (
            <>
              <input type="hidden" name="id" value={m.id} />
              <button type="submit" name="intent" value={m.status === "visible" ? "hide" : "show"} disabled={busy} className={BTN}>
                {m.status === "visible" ? "Сховати" : "Показати"}
              </button>
              <button type="button" onClick={() => setConfirming(true)} disabled={busy} className={BTN}>
                Видалити
              </button>
            </>
          )}
        </fetcher.Form>
      )}
      {m.status !== "removed" && !confirming && (
        <fetcher.Form method="post" className="mt-2">
          <input type="hidden" name="id" value={m.collectionId} />
          <button type="submit" name="intent" value={m.banned ? "unban" : "ban"} disabled={busy} className={BTN}>
            {m.banned ? "Розбанити колекцію" : "Забанити колекцію"}
          </button>
        </fetcher.Form>
      )}
    </li>
  );
}

export default function AdminMiniatures({ loaderData }: Route.ComponentProps) {
  const { tab, counts, items, nextCursor, paged } = loaderData;
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Мініатюри</h1>
      <nav aria-label="Статус" className="mt-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            to={t.key === "all" ? "/admin/miniatures" : `/admin/miniatures?status=${t.key}`}
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
        <p className="py-12 text-muted">Тут порожньо.</p>
      ) : (
        <ul className="mt-2">
          {items.map((m) => (
            <MiniatureRow key={m.id} m={m} />
          ))}
        </ul>
      )}

      <div className="mt-6 flex gap-3">
        {paged && (
          <Link to={tab === "all" ? "/admin/miniatures" : `/admin/miniatures?status=${tab}`} className="min-h-10 rounded-full border border-line px-4 py-2 text-sm hover:border-muted">
            На початок
          </Link>
        )}
        {nextCursor && (
          <Link
            to={`/admin/miniatures?${new URLSearchParams({ ...(tab === "all" ? {} : { status: tab }), cursor: nextCursor })}`}
            className="min-h-10 rounded-full border border-line px-4 py-2 text-sm hover:border-muted"
          >
            Старіші
          </Link>
        )}
      </div>
    </>
  );
}
