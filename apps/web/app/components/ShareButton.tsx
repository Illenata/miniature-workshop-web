import { useState } from "react";
import { useT } from "../lib/i18n";

/** Web Share API where available (phones), otherwise copies the link (spec section 6). */
export function ShareButton({
  title,
  url,
  className,
  label,
}: {
  title: string;
  url: string;
  className?: string;
  /** Defaults to "Share". */
  label?: string;
}) {
  const t = useT();
  const [status, setStatus] = useState("");

  async function share() {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch (err) {
        if ((err as DOMException).name === "AbortError") return; // closed the share sheet
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setStatus(t("m.linkCopied"));
    } catch {
      setStatus(t("m.copyFailed"));
    }
    window.setTimeout(() => setStatus(""), 3000);
  }

  return (
    <>
      <button type="button" onClick={share} className={className}>
        {label ?? t("m.share")}
      </button>
      <span role="status" aria-live="polite" className="text-sm text-muted">
        {status}
      </span>
    </>
  );
}
