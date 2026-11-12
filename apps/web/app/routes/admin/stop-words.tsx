import { useState } from "react";
import { data, useFetcher } from "react-router";
import type { Route } from "./+types/stop-words";
import { ADMIN_HEADERS } from "../../lib/admin-meta";
import { adminFetch, assertSameOrigin, kyivDateTime, requireAdmin } from "../../lib/admin.server";

export const headers = () => ADMIN_HEADERS;

type Match = "word" | "substring";
type ApiItem = { id: number; word: string; match: Match; created_at: string };
type AddResult = { added: string[]; duplicates: string[]; invalid: string[] };
type CheckResult = { normalized: string; matches: { id: number; word: string; match: Match }[] };

const MATCH_LABELS: Record<Match, string> = { word: "ціле слово", substring: "підрядок" };
const MAX_PER_ADD = 500;

export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireAdmin(request);
  const res = await adminFetch("/stop-words", { token: session.token });
  if (!res.ok) throw data(null, { status: 502 });
  const list = (await res.json()) as { items: ApiItem[] };

  return {
    items: list.items.map((w) => ({
      id: w.id,
      word: w.word,
      match: w.match,
      createdAt: w.created_at,
      created: kyivDateTime(w.created_at),
    })),
  };
}

type ActionResult =
  | { intent: "add"; error: string | null; result: AddResult | null; nonce: number }
  | { intent: "remove"; error: string | null }
  | { intent: "check"; error: string | null; result: CheckResult | null };

const json = (body: unknown) => ({ body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  const session = await requireAdmin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const token = session.token;

  if (intent === "add") {
    const words = String(form.get("words") ?? "");
    const match = form.get("match") === "substring" ? "substring" : "word";
    const res = await adminFetch("/stop-words", { method: "POST", token, ...json({ words, match }) });
    if (res.ok) {
      return { intent, error: null, result: (await res.json()) as AddResult, nonce: Date.now() } satisfies ActionResult;
    }

    const error =
      res.status === 400 ? `Порожньо або забагато рядків (не більше ${MAX_PER_ADD} за раз).` : "Не вдалося додати. Спробуй ще раз.";
    return data({ intent, error, result: null, nonce: 0 } satisfies ActionResult, { status: res.status === 400 ? 400 : 502 });
  }

  if (intent === "remove") {
    const id = encodeURIComponent(String(form.get("id") ?? ""));
    const res = await adminFetch(`/stop-words/${id}`, { method: "DELETE", token });
    // 404: already removed (second click, another tab); the list reloads with the truth.
    if (res.ok || res.status === 404) return { intent, error: null } satisfies ActionResult;

    return data({ intent, error: "Не вдалося видалити. Спробуй ще раз." } satisfies ActionResult, { status: 502 });
  }

  if (intent === "check") {
    const text = String(form.get("text") ?? "");
    const res = await adminFetch("/stop-words/check", { method: "POST", token, ...json({ text }) });
    if (res.ok) return { intent, error: null, result: (await res.json()) as CheckResult } satisfies ActionResult;

    return data({ intent, error: "Не вдалося перевірити. Спробуй ще раз.", result: null } satisfies ActionResult, { status: 502 });
  }

  return data({ error: "Невідома дія." }, { status: 400 });
}

const BTN = "min-h-10 rounded-full border border-line px-4 text-sm hover:border-muted disabled:opacity-60";
const TEXTAREA = "mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-base";

function AddForm() {
  const fetcher = useFetcher<ActionResult>();
  const reply = fetcher.data?.intent === "add" ? fetcher.data : null;
  const result = reply?.result;

  return (
    // A new key after each successful add empties the form.
    <fetcher.Form key={reply?.nonce ?? 0} method="post" className="max-w-xl space-y-3">
      <label className="block text-sm font-medium">
        Нові стоп-слова, по одному в рядку
        <textarea name="words" rows={4} required className={TEXTAREA} />
      </label>
      <fieldset>
        <legend className="text-sm font-medium">Як шукати</legend>
        <div className="mt-1 space-y-1 text-sm">
          <label className="flex items-start gap-2">
            <input type="radio" name="match" value="word" defaultChecked className="mt-0.5 size-4 accent-[#ededed]" />
            <span>
              Ціле слово <span className="text-muted">— «ass» знайде «ass» і «a.s.s», але не «class»</span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" name="match" value="substring" className="mt-0.5 size-4 accent-[#ededed]" />
            <span>
              Підрядок <span className="text-muted">— знайде будь-де, і всередині інших слів</span>
            </span>
          </label>
        </div>
      </fieldset>
      <button type="submit" name="intent" value="add" disabled={fetcher.state !== "idle"} className={BTN}>
        Додати
      </button>

      {reply?.error && (
        <p role="alert" className="text-sm text-red-300">
          {reply.error}
        </p>
      )}
      {result && (
        <div role="status" className="space-y-1 text-sm">
          <p>Додано: {result.added.length}</p>
          {result.duplicates.length > 0 && (
            <p className="text-muted">Уже є в списку: {result.duplicates.join(", ")}</p>
          )}
          {result.invalid.length > 0 && (
            <p className="text-amber-300">
              Не прийнято (довші за 64 символи або без жодної літери): {result.invalid.join(", ")}
            </p>
          )}
        </div>
      )}
    </fetcher.Form>
  );
}

function CheckForm() {
  const fetcher = useFetcher<ActionResult>();
  const reply = fetcher.data?.intent === "check" ? fetcher.data : null;
  const result = reply?.result;

  return (
    <fetcher.Form method="post" className="max-w-xl space-y-3">
      <label className="block text-sm font-medium">
        Текст для перевірки
        <textarea name="text" rows={3} maxLength={2000} required className={TEXTAREA} />
      </label>
      <button type="submit" name="intent" value="check" disabled={fetcher.state !== "idle"} className={BTN}>
        Перевірити
      </button>

      {reply?.error && (
        <p role="alert" className="text-sm text-red-300">
          {reply.error}
        </p>
      )}
      {result && (
        <div role="status" className="space-y-1 text-sm">
          {result.matches.length === 0 ? (
            <p className="text-emerald-300">Збігів немає: такий текст пройде.</p>
          ) : (
            <p className="text-red-300">
              Збіги: {result.matches.map((m) => `${m.word} (${MATCH_LABELS[m.match]})`).join(", ")}
            </p>
          )}
          <p className="break-words text-muted">Після нормалізації: {result.normalized || "—"}</p>
        </div>
      )}
    </fetcher.Form>
  );
}

type Row = Route.ComponentProps["loaderData"]["items"][number];

function StopWordRow({ w }: { w: Row }) {
  const fetcher = useFetcher<ActionResult>();
  const error = fetcher.data?.intent === "remove" ? fetcher.data.error : null;

  return (
    <li className="flex items-center gap-3 border-b border-line py-2">
      <div className="min-w-0 flex-1">
        <p className="break-words font-medium">{w.word}</p>
        <p className="text-sm text-muted">
          {MATCH_LABELS[w.match]} · <time dateTime={w.createdAt}>{w.created}</time>
        </p>
        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}
      </div>
      <fetcher.Form method="post">
        <input type="hidden" name="id" value={w.id} />
        <button
          type="submit"
          name="intent"
          value="remove"
          disabled={fetcher.state !== "idle"}
          aria-label={`Видалити «${w.word}»`}
          className={BTN}
        >
          Видалити
        </button>
      </fetcher.Form>
    </li>
  );
}

export default function AdminStopWords({ loaderData }: Route.ComponentProps) {
  const { items } = loaderData;
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle ? items.filter((w) => w.word.toLowerCase().includes(needle)) : items;

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Стоп-слова</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Завантаження з таким словом у назві, описі чи назві майстерні відхиляється; гравцеві слово не називається.
        Перед пошуком текст нормалізується: регістр, діакритика, заміни 0→o, 1→i, 3→e, @→a, $→s, схожі кириличні й
        латинські літери, крапки й пробіли всередині слова.
      </p>

      <section aria-labelledby="add-heading" className="mt-6">
        <h2 id="add-heading" className="font-semibold">
          Додати
        </h2>
        <div className="mt-2">
          <AddForm />
        </div>
      </section>

      <section aria-labelledby="check-heading" className="mt-8">
        <h2 id="check-heading" className="font-semibold">
          Перевірити текст
        </h2>
        <div className="mt-2">
          <CheckForm />
        </div>
      </section>

      <section aria-labelledby="list-heading" className="mt-8">
        <h2 id="list-heading" className="font-semibold">
          Список · {items.length}
        </h2>
        {items.length === 0 ? (
          <p className="py-8 text-muted">Список порожній: поки що завантаження нічим не фільтруються.</p>
        ) : (
          <>
            <label className="mt-2 block max-w-xs text-sm">
              <span className="sr-only">Знайти в списку</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
                placeholder="Знайти в списку"
                className="block min-h-10 w-full rounded-lg border border-line bg-surface px-3 text-base"
              />
            </label>
            {shown.length === 0 ? (
              <p className="py-6 text-muted">Нічого не знайдено.</p>
            ) : (
              <ul className="mt-2 max-w-xl">
                {shown.map((w) => (
                  <StopWordRow key={w.id} w={w} />
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </>
  );
}
