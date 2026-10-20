import { useT } from "../lib/i18n";
import { setViewMode, useViewMode, type ViewMode } from "../lib/view-mode";

const MODES: { mode: ViewMode; key: "view.card" | "view.3d" }[] = [
  { mode: "card", key: "view.card" },
  { mode: "3d", key: "view.3d" },
];

export function ViewModeToggle() {
  const t = useT();
  const current = useViewMode();
  return (
    <div role="group" aria-label={t("view.label")} className="inline-flex rounded-full border border-line p-0.5">
      {MODES.map(({ mode, key }) => (
        <button
          key={mode}
          type="button"
          aria-pressed={mode === current}
          onClick={() => setViewMode(mode)}
          className={`min-h-9 min-w-12 rounded-full px-3 text-sm ${
            mode === current ? "bg-ink font-medium text-surface" : "text-muted hover:text-ink"
          }`}
        >
          {t(key)}
        </button>
      ))}
    </div>
  );
}
