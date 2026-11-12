import type { Route } from "./+types/home";
import { adminFetch, kyivDateTime, requireAdmin } from "../../lib/admin.server";
import { ADMIN_HEADERS } from "../../lib/admin-meta";

export const headers = () => ADMIN_HEADERS;

type Action = { id: number; actor: string; action: string; target: string; created_at: string };

const ACTION_NAMES: Record<string, string> = {
  login: "Вхід",
  login_failed: "Невдала спроба входу",
  logout: "Вихід",
  hide_miniature: "Сховано мініатюру",
  show_miniature: "Показано мініатюру",
  remove_miniature: "Видалено мініатюру",
  dismiss_reports: "Відхилено скарги",
  add_stop_words: "Додано стоп-слова",
  remove_stop_word: "Видалено стоп-слово",
  ban_collection: "Забанено колекцію",
  unban_collection: "Розбанено колекцію",
};

export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireAdmin(request);
  const res = await adminFetch("/actions?limit=10", { token: session.token });
  const body = res.ok ? ((await res.json()) as { items: Action[] }) : { items: [] };
  return {
    actions: body.items.map((a) => ({
      id: a.id,
      name: ACTION_NAMES[a.action] ?? a.action,
      target: a.target,
      at: kyivDateTime(a.created_at),
      iso: a.created_at,
    })),
  };
}

export default function AdminHome({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Останні дії</h1>
      <p className="mt-1 text-sm text-muted">Тут з'являтимуться всі дії модератора: приховування, видалення, бани.</p>
      <table className="mt-4 w-full max-w-2xl text-left text-sm">
        <thead className="text-muted">
          <tr>
            <th scope="col" className="border-b border-line py-2 pr-4 font-normal">Коли (Київ)</th>
            <th scope="col" className="border-b border-line py-2 pr-4 font-normal">Дія</th>
            <th scope="col" className="border-b border-line py-2 font-normal">Об'єкт</th>
          </tr>
        </thead>
        <tbody>
          {loaderData.actions.map((a) => (
            <tr key={a.id}>
              <td className="border-b border-line py-2 pr-4 whitespace-nowrap">
                <time dateTime={a.iso}>{a.at}</time>
              </td>
              <td className="border-b border-line py-2 pr-4">{a.name}</td>
              <td className="border-b border-line py-2 text-muted">{a.target}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
