import type { OAuthAppOut } from "./api";

export type OAuthProvider = OAuthAppOut["type"];

/** The connection in progress while the browser is away at the provider. */
export interface PendingOAuth {
  workspaceId: string;
  workspaceSlug: string;
  state: string;
  // Only set by a flow started before destinations were chosen after connecting.
  listId?: string;
  projectKey?: string;
  projectGid?: string;
}

const PENDING_KEYS: Record<OAuthProvider, string> = {
  clickup: "backline:clickup-oauth-pending",
  jira: "backline:jira-oauth-pending",
  asana: "backline:asana-oauth-pending",
};

/** Anti-CSRF token for the ClickUp/Jira/Asana "connect" OAuth round trips - generated
 * before redirecting, stored alongside the pending connection details in
 * sessionStorage, and checked against the `state` query param the provider echoes
 * back on redirect. Without this, an attacker who starts their own OAuth flow and
 * captures the resulting `code` can get a victim to open a crafted callback URL and
 * link the attacker's external account into the victim's workspace integration. */
export function generateOAuthState(): string {
  return crypto.randomUUID();
}

/** Leaves for the provider's consent screen. `authorize_url` comes from the API, built
 * with the same redirect URI its code exchange will send - only `state` is added here. */
export function startOAuth(app: OAuthAppOut, workspace: { id: string; slug: string }): void {
  const state = generateOAuthState();
  const pending: PendingOAuth = { workspaceId: workspace.id, workspaceSlug: workspace.slug, state };
  sessionStorage.setItem(PENDING_KEYS[app.type], JSON.stringify(pending));
  const separator = app.authorize_url.includes("?") ? "&" : "?";
  window.location.href = `${app.authorize_url}${separator}state=${encodeURIComponent(state)}`;
}

/** The pending connection for this provider, removed as it's read so a callback URL
 * can't be replayed. */
export function takePendingOAuth(provider: OAuthProvider): PendingOAuth | null {
  const raw = sessionStorage.getItem(PENDING_KEYS[provider]);
  if (!raw) return null;
  sessionStorage.removeItem(PENDING_KEYS[provider]);
  try {
    return JSON.parse(raw) as PendingOAuth;
  } catch {
    return null;
  }
}
