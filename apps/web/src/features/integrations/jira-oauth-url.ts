const JIRA_CLIENT_ID = import.meta.env.VITE_JIRA_OAUTH_CLIENT_ID ?? "";

export function buildJiraAuthUrl(): string {
  const params = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: JIRA_CLIENT_ID,
    scope: "read:jira-work write:jira-work offline_access",
    redirect_uri: `${window.location.origin}/integrations/jira/callback`,
    response_type: "code",
    prompt: "consent",
  });
  return `https://auth.atlassian.com/authorize?${params.toString()}`;
}
