import { redirect } from "react-router";

// The landing page comes later in phase 1; until then the gallery is the front door.
export function loader() {
  return redirect("/gallery");
}
