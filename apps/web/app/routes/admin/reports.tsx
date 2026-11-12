import { data, Link } from "react-router";
import type { Route } from "./+types/reports";
import { MiniatureModeration, statusLabel } from "../../components/admin/MiniatureModeration";
import { moderationAction } from "../../lib/admin-actions.server";
import { ADMIN_HEADERS } from "../../lib/admin-meta";
import { adminFetch, kyivDateTime, requireAdmin } from "../../lib/admin.server";

export const headers = () => ADMIN_HEADERS;

type Reason = "offensive" | "spam" | "stolen" | "other";
type ApiItem = {
  id: string;
  title: string;
  status: "visible" | "hidden" | "removed";
  hidden_reason: "reports" | "moderator" | null;
  collection: { id: string; name: string | null; status: "active" | "banned" };
  reports: { id: number; reason: Reason; text: string; created_at: string }[];
  last_report_at: string;
};
type ApiList = { items: ApiItem[]; counts: { miniatures: number; reports: number }; next_cursor: string | null };

/** The same four reasons as in the public report form (spec section 7). */
const REASONS: Record<Reason, string> = {
  offensive: "Образливий вміст",
  spam: "Спам",
  stolen: "Чужа робота",
  other: "Інше",
};

/** "Спам ×2, Інше": how many reports of each kind, most frequent first. */
function reasonSummary(reasons: Reason[]): string {
  const counts = new Map<Reason, number>();
  for (const reason of reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1);

  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, n]) => (n > 1 ? `${REASONS[reason]} ×${n}` : REASONS[reason]))
    .join(", ");
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireAdmin(request);
  const cursor = new URL(request.url).searchParams.get("cursor");

  const res = await adminFetch(`/reports${cursor ? `?${new URLSearchParams({ cursor })}` : ""}`, { token: session.token });
  if (!res.ok) throw data(null, { status: 502 });
  const list = (await res.json()) as ApiList;

  return {
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
      reasons: reasonSummary(m.reports.map((r) => r.reason)),
      reports: m.reports.map((r) => ({
        id: r.id,
        reason: REASONS[r.reason],
        text: r.text,
        createdAt: r.created_at,
        created: kyivDateTime(r.created_at),
      })),
    })),
  };
}

export async function action({ request }: Route.ActionArgs) {
  return moderationAction(request);
}

type Row = Route.ComponentProps["loaderData"]["items"][number];

function ReportedRow({ m }: { m: Row }) {
  const status = statusLabel(m);
  const publicPage = m.status === "visible" && !m.banned;

  return (
    <li className="border-b border-line py-4">
      <div className="flex items-center gap-3">
        <img
          src={`/admin/miniatures/${m.id}/thumb.webp`}
          alt=""
          width={48}
          height={64}
          loading="lazy"
          className="h-16 w-12 shrink-0 rounded bg-raised object-cover"
        />
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
            <span className={status.tone}>{status.text}</span>
            <span className="text-muted"> · скарг: {m.reports.length}</span>
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm">
        <span className="text-muted">Причини: </span>
        {m.reasons}
      </p>
      <ul className="mt-2 max-w-2xl space-y-2">
        {m.reports.map((r) => (
          <li key={r.id} className="rounded-lg bg-raised px-3 py-2 text-sm">
            <p className="text-muted">
              {r.reason} · <time dateTime={r.createdAt}>{r.created}</time>
            </p>
            {r.text ? (
              <p className="mt-1 break-words whitespace-pre-line">{r.text}</p>
            ) : (
              <p className="mt-1 text-muted">Без тексту.</p>
            )}
          </li>
        ))}
      </ul>

      <MiniatureModeration m={m} dismissable />
    </li>
  );
}

export default function AdminReports({ loaderData }: Route.ComponentProps) {
  const { counts, items, nextCursor, paged } = loaderData;
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Скарги</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Мініатюри з відкритими скаргами, найсвіжіші вгорі. «Відхилити скарги» закриває їх і повертає на сайт
        мініатюру, яку скарги сховали автоматично. «Показати» й «Видалити» теж закривають скарги.
      </p>
      <p className="mt-3 text-sm">
        Мініатюр у черзі: {counts.miniatures} · відкритих скарг: {counts.reports}
      </p>

      {items.length === 0 ? (
        <p className="py-12 text-muted">{paged ? "Тут порожньо." : "Відкритих скарг немає."}</p>
      ) : (
        <ul className="mt-2">
          {items.map((m) => (
            <ReportedRow key={m.id} m={m} />
          ))}
        </ul>
      )}

      <div className="mt-6 flex gap-3">
        {paged && (
          <Link to="/admin/reports" className="min-h-10 rounded-full border border-line px-4 py-2 text-sm hover:border-muted">
            На початок
          </Link>
        )}
        {nextCursor && (
          <Link
            to={`/admin/reports?${new URLSearchParams({ cursor: nextCursor })}`}
            className="min-h-10 rounded-full border border-line px-4 py-2 text-sm hover:border-muted"
          >
            Старіші
          </Link>
        )}
      </div>
    </>
  );
}
