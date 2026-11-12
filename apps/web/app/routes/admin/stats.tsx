import { data } from "react-router";
import type { Route } from "./+types/stats";
import { ADMIN_HEADERS } from "../../lib/admin-meta";
import { adminFetch, requireAdmin } from "../../lib/admin.server";

export const headers = () => ADMIN_HEADERS;

type ApiDay = { day: string; uploads: number; new_collections: number; views: number; reports: number };
type ApiStats = {
  days: ApiDay[];
  totals: Omit<ApiDay, "day">;
  rejections: { code: string; count: number }[];
};

/** Upload error codes of spec appendix B, in the moderator's words. */
const REJECTION_NAMES: Record<string, string> = {
  invalid_manifest: "Невалідний manifest",
  missing_file: "Немає glb або картки",
  bad_key: "Ключ відсутній або не того формату",
  banned: "Забанена колекція чи адреса",
  too_large: "Завеликий пакет або файл",
  bad_glb: "glb не пройшов перевірку",
  bad_card: "Картка не PNG або не 1200×1600",
  bad_journal: "Хеш журналу не збігається",
  text_rejected: "Стоп-слово в тексті",
  collection_full: "Колекція заповнена",
  rate_limited: "Перевищено ліміт частоти",
  storage_unavailable: "Сховище або база недоступні",
};

// Days are UTC days (the counters are kept that way), so they are formatted in UTC too.
const DAY = new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit", weekday: "short", timeZone: "UTC" });
const NUMBER = new Intl.NumberFormat("uk-UA");

export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireAdmin(request);
  const res = await adminFetch("/stats", { token: session.token });
  if (!res.ok) throw data(null, { status: 502 });
  const stats = (await res.json()) as ApiStats;
  const cell = (n: number) => ({ n, text: NUMBER.format(n) });

  return {
    totals: [
      { label: "Завантаження", value: NUMBER.format(stats.totals.uploads) },
      { label: "Нові колекції", value: NUMBER.format(stats.totals.new_collections) },
      { label: "Перегляди мініатюр", value: NUMBER.format(stats.totals.views) },
      { label: "Скарги", value: NUMBER.format(stats.totals.reports) },
    ],
    days: stats.days.map((d) => ({
      day: d.day,
      label: DAY.format(new Date(`${d.day}T00:00:00Z`)),
      cells: [cell(d.uploads), cell(d.new_collections), cell(d.views), cell(d.reports)],
    })),
    rejections: stats.rejections.map((r) => ({
      code: r.code,
      name: REJECTION_NAMES[r.code] ?? "Інший код",
      count: NUMBER.format(r.count),
    })),
  };
}

const TH = "border-b border-line py-2 pl-3 text-right align-bottom font-normal first:pl-0 first:text-left";
const TD = "border-b border-line py-2 pl-3 text-right tabular-nums first:pl-0 first:text-left";

export default function AdminStats({ loaderData }: Route.ComponentProps) {
  const { totals, days, rejections } = loaderData;

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Статистика за 30 днів</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Дні рахуються за UTC: такий день починається о 02:00 за Києвом узимку й о 03:00 влітку. Сьогоднішній день ще триває. Завантаження
        рахується днем, коли мініатюра з'явилася вперше; повторне «Поділитися» тієї самої мініатюри не додається.
      </p>

      <dl className="mt-4 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
        {totals.map((t) => (
          <div key={t.label} className="rounded-lg bg-raised px-3 py-3">
            <dt className="text-sm text-muted">{t.label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{t.value}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="days-heading" className="mt-8">
        <h2 id="days-heading" className="font-semibold">
          По днях
        </h2>
        <table className="mt-2 w-full max-w-2xl text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th scope="col" className={TH}>День</th>
              <th scope="col" className={TH}>Заванта&shy;ження</th>
              <th scope="col" className={TH}>Нові колекції</th>
              <th scope="col" className={TH}>Перегляди</th>
              <th scope="col" className={TH}>Скарги</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.day}>
                <th scope="row" className={`${TD} font-normal whitespace-nowrap`}>
                  <time dateTime={d.day}>{d.label}</time>
                </th>
                {d.cells.map((c, i) => (
                  <td key={i} className={`${TD} ${c.n === 0 ? "text-muted" : ""}`}>
                    {c.text}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="rejections-heading" className="mt-8">
        <h2 id="rejections-heading" className="font-semibold">
          Відмови в завантаженні за кодами
        </h2>
        {rejections.length === 0 ? (
          <p className="py-4 text-sm text-muted">За цей період відмов не було.</p>
        ) : (
          <table className="mt-2 w-full max-w-2xl text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th scope="col" className={TH}>Причина</th>
                <th scope="col" className={TH}>Код</th>
                <th scope="col" className={TH}>Разів</th>
              </tr>
            </thead>
            <tbody>
              {rejections.map((r) => (
                <tr key={r.code}>
                  <th scope="row" className={`${TD} font-normal`}>{r.name}</th>
                  <td className={`${TD} break-all text-muted`}>{r.code}</td>
                  <td className={TD}>{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
