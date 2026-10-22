import type { MiniatureItem } from "@mw/contract";
import { formatDuration } from "../lib/format";
import { useT } from "../lib/i18n";

/** "bowmen_head_faceless_01" in kit "kit_bowmen" → "head faceless 01". */
export function partLabel(partId: string, kitId: string): string {
  const prefix = `${kitId.replace(/^kit_/, "")}_`;
  const rest = partId.startsWith(prefix) ? partId.slice(prefix.length) : partId;
  return rest.replace(/_/g, " ");
}

/** Appraisal is shown as-is (spec section 6): nested keys flattened to "profile.poise: 3". */
export function flattenAppraisal(value: unknown, prefix = ""): [string, string][] {
  if (value === null || typeof value !== "object") return prefix ? [[prefix, String(value)]] : [];
  if (Array.isArray(value)) return [[prefix, value.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", ")]];
  return Object.entries(value).flatMap(([k, v]) => flattenAppraisal(v, prefix ? `${prefix}.${k}` : k));
}

function groupByKit(parts: MiniatureItem["parts"]) {
  const kits = new Map<string, { name: string; parts: string[] }>();
  for (const p of parts) {
    const kit = kits.get(p.kit_id) ?? { name: p.kit_name, parts: [] };
    kit.parts.push(partLabel(p.part_id, p.kit_id));
    kits.set(p.kit_id, kit);
  }
  return [...kits.values()];
}

/** `strokes` comes pre-formatted from the server (number formatting differs between ICU builds). */
export function MiniatureSpecs({ item, strokes }: { item: MiniatureItem; strokes: string }) {
  const t = useT();
  const appraisal = flattenAppraisal(item.appraisal);

  const row = "grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 border-t border-line py-3";
  return (
    <section aria-labelledby="specs-heading" className="mt-8">
      <h2 id="specs-heading" className="mb-1 text-base font-semibold">
        {t("m.specs")}
      </h2>
      <dl className="text-sm">
        {item.faction && (
          <div className={row}>
            <dt className="text-muted">{t("m.faction")}</dt>
            <dd className={item.faction === "gilded" ? "text-gilded" : "text-painted"}>
              {t(`faction.${item.faction}`)}
            </dd>
          </div>
        )}
        <div className={row}>
          <dt className="text-muted">{t("m.parts")}</dt>
          <dd className="space-y-2">
            {groupByKit(item.parts).map((kit) => (
              <div key={kit.name}>
                <p className="font-medium">{kit.name}</p>
                <p className="text-muted">{kit.parts.join(", ")}</p>
              </div>
            ))}
          </dd>
        </div>
        {item.paints.length > 0 && (
          <div className={row}>
            <dt className="text-muted">{t("m.paints")}</dt>
            <dd>
              <ul className="flex flex-wrap gap-x-4 gap-y-2">
                {item.paints.map((p) => (
                  <li key={p.paint_id} className="flex items-center gap-2">
                    {/* An SVG fill, not an inline style: the page CSP forbids style attributes. */}
                    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
                      <circle cx="8" cy="8" r="7.5" fill={p.rgb} stroke="rgba(255,255,255,0.25)" />
                    </svg>
                    {p.name}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        <div className={row}>
          <dt className="text-muted">{t("m.strokes")}</dt>
          <dd>{strokes}</dd>
        </div>
        <div className={row}>
          <dt className="text-muted">{t("m.workTime")}</dt>
          <dd>
            {formatDuration(item.work_seconds)} <span className="text-muted">{t("m.workTimeUnit")}</span>
          </dd>
        </div>
        {appraisal.length > 0 && (
          <div className={row}>
            <dt className="text-muted">{t("m.appraisal")}</dt>
            <dd>
              <ul className="space-y-0.5">
                {appraisal.map(([k, v]) => (
                  <li key={k}>
                    <span className="text-muted">{k}:</span> {v}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}
