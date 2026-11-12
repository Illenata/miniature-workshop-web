import type { Route } from "./+types/terms";
import { LegalDocument, legalMeta } from "../components/LegalDocument";
import { detectLang } from "../lib/i18n.server";
import { legalPage } from "../lib/legal.server";

export function loader({ request }: Route.LoaderArgs) {
  return { page: legalPage("terms", detectLang(request)) };
}

export const meta = legalMeta;

export default function Terms({ loaderData }: Route.ComponentProps) {
  return <LegalDocument page={loaderData.page} />;
}
