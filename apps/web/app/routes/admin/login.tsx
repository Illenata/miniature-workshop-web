import { data, Form, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/login";
import { adminFetch, assertSameOrigin, getAdminSession, sessionCookie } from "../../lib/admin.server";
import { ADMIN_HEADERS, ADMIN_META } from "../../lib/admin-meta";

export const meta = () => ADMIN_META;
export const headers = () => ADMIN_HEADERS;

export async function loader({ request }: Route.LoaderArgs) {
  if (await getAdminSession(request)) throw redirect("/admin");
  return null;
}

type LoginError = "invalid" | "rate_limited" | "disabled" | "failed";

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  const form = await request.formData();
  const res = await adminFetch("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: String(form.get("password") ?? ""), code: String(form.get("code") ?? "") }),
    forwardedFor: request.headers.get("x-forwarded-for"),
  });
  if (res.ok) {
    const body = (await res.json()) as { token: string; expires_at: string };
    return redirect("/admin", { headers: { "Set-Cookie": sessionCookie(body.token, body.expires_at) } });
  }
  if (res.status === 429) {
    const body = (await res.json().catch(() => ({}))) as { retry_after?: number };
    const minutes = Math.max(1, Math.ceil((body.retry_after ?? 900) / 60));
    return data({ error: "rate_limited" as LoginError, minutes }, { status: 429 });
  }
  if (res.status === 503) return data({ error: "disabled" as LoginError, minutes: 0 }, { status: 503 });
  if (res.status === 401) return data({ error: "invalid" as LoginError, minutes: 0 }, { status: 401 });
  return data({ error: "failed" as LoginError, minutes: 0 }, { status: 502 });
}

function message(error: LoginError, minutes: number) {
  switch (error) {
    case "invalid":
      // Deliberately does not say which of the two was wrong.
      return "Неправильний пароль або код.";
    case "rate_limited":
      return `Забагато невдалих спроб. Спробуй ще раз через ${minutes} хв.`;
    case "disabled":
      return "Адмінку ще не налаштовано: запусти npm run admin:setup і додай два рядки в .env.";
    case "failed":
      return "Не вдалося увійти: сервер не відповів. Спробуй ще раз.";
  }
}

const INPUT = "mt-1 block min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-base";

export default function AdminLogin({ actionData }: Route.ComponentProps) {
  const sending = useNavigation().state === "submitting";
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Адмінка</h1>
      <p className="mt-1 text-sm text-muted">Miniature Workshop</p>

      <Form method="post" className="mt-8 space-y-5" aria-describedby={actionData ? "login-error" : undefined}>
        <label className="block text-sm font-medium">
          Пароль
          <input type="password" name="password" required autoFocus autoComplete="current-password" className={INPUT} />
        </label>
        <label className="block text-sm font-medium">
          Код із застосунку (6 цифр)
          <input
            type="text"
            name="code"
            required
            inputMode="numeric"
            pattern="[0-9 ]*"
            maxLength={7}
            autoComplete="one-time-code"
            className={`${INPUT} tracking-[0.3em]`}
          />
        </label>
        {actionData && (
          <p id="login-error" role="alert" className="rounded-lg border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            {message(actionData.error, actionData.minutes)}
          </p>
        )}
        <button
          type="submit"
          disabled={sending}
          className="min-h-11 w-full rounded-full bg-ink px-5 text-sm font-medium text-surface disabled:opacity-60"
        >
          Увійти
        </button>
      </Form>
    </main>
  );
}
