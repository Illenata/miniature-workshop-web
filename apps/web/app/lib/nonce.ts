import { createContext, useContext } from "react";

/**
 * Per-request CSP nonce. Set by entry.server.tsx; on the client it is undefined
 * (browsers hide nonce values from the DOM, and hydrated scripts are not re-run).
 */
export const NonceContext = createContext<string | undefined>(undefined);

export function useNonce() {
  return useContext(NonceContext);
}
