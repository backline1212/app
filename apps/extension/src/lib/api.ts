import { API_BASE_URL } from "./config";

export class ExtensionApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

// Always Bearer-token auth, never cookies - this extension authenticates purely via
// the long-lived "Connect Extension" token (backend/app/modules/extension_tokens),
// unlike the dashboard's own api-client which also juggles a refresh cookie.
export async function apiRequest<T>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...init.headers,
      },
    });
  } catch {
    // fetch only throws when the request never got an answer (offline, DNS, blocked).
    throw new ExtensionApiError(0, "NETWORK_ERROR", "Can't reach Backline - check your connection.");
  }

  if (!response.ok) {
    if (response.status === 404 && response.headers.get("x-railway-fallback") === "true") {
      throw new ExtensionApiError(503, "SERVICE_UNAVAILABLE", "Backline is temporarily unavailable. Try again shortly.");
    }
    const body = await response.json().catch(() => null);
    throw new ExtensionApiError(
      response.status,
      body?.error?.code ?? "UNKNOWN_ERROR",
      body?.error?.message ?? response.statusText,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}
