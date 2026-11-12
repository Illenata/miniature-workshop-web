import { useState } from "react";
import { useFetcher } from "react-router";

/** What the moderation buttons need to know about a miniature (admin lists share this shape). */
export type ModeratedMiniature = {
  id: string;
  status: "visible" | "hidden" | "removed";
  hiddenReason: "reports" | "moderator" | null;
  collectionId: string;
  banned: boolean;
};

export function statusLabel(m: ModeratedMiniature): { text: string; tone: string } {
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

/**
 * The moderation buttons of one miniature: "Сховати / Показати", "Видалити" (confirmed in
 * place), ban or unban of its collection and, in the reports queue, "Відхилити скарги".
 * Posts to the route it is rendered in, whose action must be `moderationAction`.
 */
export function MiniatureModeration({ m, dismissable = false }: { m: ModeratedMiniature; dismissable?: boolean }) {
  const fetcher = useFetcher<{ error: string | null }>();
  const busy = fetcher.state !== "idle";
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      {fetcher.data?.error && (
        <p role="alert" className="mt-2 text-sm text-red-300">
          {fetcher.data.error}
        </p>
      )}

      {m.status !== "removed" && (
        <fetcher.Form method="post" className="mt-3 flex flex-wrap gap-2" onSubmit={() => setConfirming(false)}>
          <input type="hidden" name="id" value={m.id} />
          {confirming ? (
            <>
              <p className="w-full text-sm">Стерти файли цієї мініатюри назавжди? Повернути їх буде неможливо.</p>
              <button type="submit" name="intent" value="remove" disabled={busy} className={BTN_DANGER}>
                Так, видалити
              </button>
              <button type="button" onClick={() => setConfirming(false)} className={BTN}>
                Скасувати
              </button>
            </>
          ) : (
            <>
              {dismissable && (
                <button type="submit" name="intent" value="dismiss" disabled={busy} className={BTN}>
                  Відхилити скарги
                </button>
              )}
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
    </>
  );
}
