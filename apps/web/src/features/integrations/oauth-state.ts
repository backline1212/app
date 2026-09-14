/** Anti-CSRF token for the ClickUp/Jira/Asana "connect" OAuth round trips - generated
 * before redirecting, stored alongside the pending connection details in
 * sessionStorage, and checked against the `state` query param the provider echoes
 * back on redirect. Without this, an attacker who starts their own OAuth flow and
 * captures the resulting `code` can get a victim to open a crafted callback URL and
 * link the attacker's external account into the victim's workspace integration. */
export function generateOAuthState(): string {
  return crypto.randomUUID();
}
