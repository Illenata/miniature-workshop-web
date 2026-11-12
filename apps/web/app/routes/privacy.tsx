import type { Route } from "./+types/privacy";
import { LegalDocument, legalMeta } from "../components/LegalDocument";
import { detectLang } from "../lib/i18n.server";
import { legalPage } from "../lib/legal.server";

export function loader({ request }: Route.LoaderArgs) {
  return { page: legalPage("privacy", detectLang(request)) };
}

export const meta = legalMeta;

export default function Privacy({ loaderData }: Route.ComponentProps) {
  return <LegalDocument page={loaderData.page} />;
}
