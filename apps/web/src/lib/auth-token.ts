// Plain module-level holder for the current access JWT - deliberately not
// localStorage (13-Authentication.md §13.6, XSS exfiltration surface). AuthProvider
// wraps this with React state for reactivity; api-client reads it directly so every
// request always sees the latest value without threading it through call sites.
import { decodeAccessToken } from "./jwt";

let currentAccessToken: string | null = null;
let tokenRevision = 0;
let contextRevision = 0;

type Listener = (token: string | null) => void;
const listeners = new Set<Listener>();

export function getAccessToken(): string | null {
  return currentAccessToken;
}

export function getAccessTokenRevision(): number {
  return tokenRevision;
}

// Refresh/role renewal can change the token without changing request ownership.
// Logout then login to the same account must still invalidate old request retries.
export function getAccessContextRevision(): number {
  return contextRevision;
}

export function setAccessToken(token: string | null): void {
  const previous = decodeAccessToken(currentAccessToken ?? "");
  const next = decodeAccessToken(token ?? "");
  if (!previous || !next || previous.sub !== next.sub || previous.workspace_id !== next.workspace_id) contextRevision += 1;
  tokenRevision += 1;
  currentAccessToken = token;
  listeners.forEach((listener) => listener(token));
}

export function onAccessTokenChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
