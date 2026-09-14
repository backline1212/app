const ASANA_CLIENT_ID = import.meta.env.VITE_ASANA_OAUTH_CLIENT_ID ?? "";

export function buildAsanaAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: ASANA_CLIENT_ID,
    redirect_uri: `${window.location.origin}/integrations/asana/callback`,
    response_type: "code",
  });
  return `https://app.asana.com/-/oauth_authorize?${params.toString()}`;
}
