import { data } from "react-router";
import { adminFetch, assertSameOrigin, requireAdmin } from "./admin.server";

const MINIATURE_INTENTS = ["hide", "show", "remove"] as const;
const COLLECTION_INTENTS = ["ban", "unban"] as const;

/**
 * One action for every moderation button (lists of miniatures and collections post here
 * through their own routes): the form carries `intent` and the `id` of its target.
 */
export async function moderationAction(request: Request) {
  assertSameOrigin(request);
  const session = await requireAdmin(request);
  const form = await request.formData();
  const id = encodeURIComponent(String(form.get("id") ?? ""));
  const intent = String(form.get("intent") ?? "");

  let path: string;
  if (intent === "dismiss") path = `/miniatures/${id}/dismiss-reports`;
  else if ((MINIATURE_INTENTS as readonly string[]).includes(intent)) path = `/miniatures/${id}/${intent}`;
  else if ((COLLECTION_INTENTS as readonly string[]).includes(intent)) path = `/collections/${id}/${intent}`;
  else return data({ error: "Невідома дія." }, { status: 400 });

  const res = await adminFetch(path, { method: "POST", token: session.token });
  // 409: already in that state (second click, another tab); the list reloads with the truth.
  if (res.ok || res.status === 409) return { error: null };
  if (intent === "remove") {
    return data({ error: "Не вдалося стерти файли. Мініатюру сховано; натисни «Видалити» ще раз." }, { status: 502 });
  }
  return data({ error: "Не вдалося виконати дію. Спробуй ще раз." }, { status: 502 });
}
