import { useState } from "react";
import { data, Form, Link, redirect, useNavigation } from "react-router";
import { REPORT_REASONS, REPORT_TEXT_MAX, reportReasonSchema } from "@mw/contract";
import type { Route } from "./+types/miniature-report";
import { fetchMiniature, postReport } from "../lib/api.server";
import { isLang, translate, useT } from "../lib/i18n";

/** A page of its own (not a pop-up): works without JS and is comfortable on a phone. */
export async function loader({ params }: Route.LoaderArgs) {
  const result = await fetchMiniature(params.id, { countView: false });
  if (result.kind !== "ok") throw data({ hidden: result.kind === "hidden" }, { status: 404 });
  const { item } = result;
  return { id: item.id, title: item.title, thumb: item.files.thumb_400 };
}

type ActionError = "chooseReason" | "tooLong" | "rateLimited" | "failed";

export async function action({ request, params }: Route.ActionArgs) {
  const form = await request.formData();
  const reason = reportReasonSchema.safeParse(form.get("reason"));
  const text = String(form.get("text") ?? "").trim();
  if (!reason.success) return { error: "chooseReason" as ActionError, text };
  if ([...text].length > REPORT_TEXT_MAX) return { error: "tooLong" as ActionError, text };

  const result = await postReport(
    { miniature_id: params.id, reason: reason.data, text },
    request.headers.get("x-forwarded-for"),
  );
  switch (result.kind) {
    case "ok":
      return redirect(`/m/${params.id}?reported=1`);
    case "not_found":
      throw data({ hidden: true }, { status: 404 });
    case "rate_limited":
      return data({ error: "rateLimited" as ActionError, text }, { status: 429 });
    case "invalid":
      return data(
        { error: (result.field === "text" ? "tooLong" : "chooseReason") as ActionError, text },
        { status: 400 },
      );
  }
}

export function meta({ matches }: Route.MetaArgs) {
  const rootLang = (matches[0]?.data as { lang?: unknown } | undefined)?.lang;
  const lang = isLang(rootLang) ? rootLang : "en";
  return [{ title: translate(lang, "report.metaTitle") }, { name: "robots", content: "noindex" }];
}

export default function ReportPage({ loaderData, actionData }: Route.ComponentProps) {
  const t = useT();
  const { id, title, thumb } = loaderData;
  const navigation = useNavigation();
  const sending = navigation.state === "submitting";
  const [length, setLength] = useState([...(actionData?.text ?? "")].length);
  const error = actionData?.error;

  return (
    <div className="mx-auto max-w-xl px-4 pb-16 pt-6">
      <div className="flex items-center gap-4">
        <img src={thumb} alt="" width={60} height={80} className="h-20 w-15 shrink-0 rounded-md bg-raised object-cover" />
        <h1 className="text-xl font-semibold leading-snug">{t("report.title", { title })}</h1>
      </div>
      <p className="mt-4 text-sm text-muted">{t("report.intro")}</p>

      <Form method="post" className="mt-6 space-y-6" aria-describedby={error ? "report-error" : undefined}>
        <fieldset>
          <legend className="mb-2 font-medium">{t("report.reasonLabel")}</legend>
          <div className="space-y-2">
            {REPORT_REASONS.map((r) => (
              <label
                key={r}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-line px-4 has-[:checked]:border-ink"
              >
                <input type="radio" name="reason" value={r} required className="size-4 accent-[#ededed]" />
                {t(`report.reason.${r}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="report-text" className="mb-2 block font-medium">
            {t("report.textLabel")}
          </label>
          <textarea
            id="report-text"
            name="text"
            rows={4}
            maxLength={REPORT_TEXT_MAX}
            defaultValue={actionData?.text ?? ""}
            onChange={(e) => setLength([...e.currentTarget.value].length)}
            aria-describedby="report-text-hint"
            className="block w-full rounded-lg border border-line bg-surface px-3 py-2 text-base"
          />
          <p id="report-text-hint" className="mt-1 text-right text-xs text-muted">
            {t("report.textHint", { count: length, max: REPORT_TEXT_MAX })}
          </p>
        </div>

        {error && (
          <p id="report-error" role="alert" className="rounded-lg border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            {t(`report.${error}`, { max: REPORT_TEXT_MAX })}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={sending}
            className="min-h-11 rounded-full bg-ink px-5 text-sm font-medium text-surface disabled:opacity-60"
          >
            {t("report.submit")}
          </button>
          <Link to={`/m/${id}`} className="min-h-11 px-3 py-3 text-sm text-muted hover:text-ink">
            {t("report.cancel")}
          </Link>
        </div>
      </Form>
    </div>
  );
}

export { MiniatureErrorBoundary as ErrorBoundary } from "../components/MiniatureErrorBoundary";
