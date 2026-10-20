import { data } from "react-router";

/** Any unknown URL renders the root error boundary with a real 404 status. */
export function loader() {
  throw data(null, { status: 404 });
}

export default function NotFound() {
  return null;
}
