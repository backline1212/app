// Plain module-level holder for the current access JWT - deliberately not
// localStorage (13-Authentication.md §13.6, XSS exfiltration surface). AuthProvider
// wraps this with React state for reactivity; api-client reads it directly so every
// request always sees the latest value without threading it through call sites.
let currentAccessToken: string | null = null;
let tokenRevision = 0;

type Listener = (token: string | null) => void;
const listeners = new Set<Listener>();

export function getAccessToken(): string | null {
  return currentAccessToken;
}

export function getAccessTokenRevision(): number {
  return tokenRevision;
}

export function setAccessToken(token: string | null): void {
  tokenRevision += 1;
  currentAccessToken = token;
  listeners.forEach((listener) => listener(token));
}

export function onAccessTokenChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
