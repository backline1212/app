const DEFAULT_API_BASE_URL = "http://localhost:8000";

export class WidgetApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

// Read lazily on every request rather than baked in at createApiClient() call time -
// the widget builds its api client before a guest session exists (ensureGuestSession
// itself needs to call the API first), then starts returning a real header only once
// that guest token is known. A one-shot header captured at construction would freeze in
// that pre-auth "no token yet" state forever.
export type AuthHeaderProvider = () => Record<string, string>;

// Inside Backline's review proxy, the page's window.fetch is wrapped so the reviewed
// site's own requests route through the proxy (backend/app/modules/proxy/interceptor.py).
// The widget's requests are to Backline itself and must skip that wrapper. Everywhere
// else (a site embedding the snippet, the browser extension) there is no wrapper and
// this is plain fetch.
export function nativeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const original = (window as { __backlineNativeFetch?: typeof fetch }).__backlineNativeFetch;
  return original ? original.call(window, input, init) : fetch(input, init);
}

export function createApiClient(
  apiBaseUrl: string = DEFAULT_API_BASE_URL,
  getAuthHeader: AuthHeaderProvider = () => ({}),
  onUnauthorized: () => void = () => undefined,
) {
  const lifetime = new AbortController();
  function requireOpen(): void {
    if (lifetime.signal.aborted) throw new WidgetApiError(401, "SESSION_ENDED", "Your review session ended. Rejoin to continue.");
  }
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    requireOpen();
    const auth = getAuthHeader();
    let response: Response;
    try {
      response = await nativeFetch(`${apiBaseUrl}${path}`, {
        ...init,
        signal: init.signal ?? lifetime.signal,
        headers: {
          "Content-Type": "application/json",
          ...auth,
          ...init.headers,
        },
      });
    } catch (error) {
      // The browser's own wording ("Failed to fetch") means nothing to a reviewer.
      // Status 0 keeps it retryable for callers that retry network failures.
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      throw new WidgetApiError(0, "NETWORK_ERROR", "Can't reach Backline - check your connection.");
    }
    requireOpen();

    if (!response.ok) {
      if (response.status === 404 && response.headers.get("x-railway-fallback") === "true") {
        throw new WidgetApiError(503, "SERVICE_UNAVAILABLE", "Backline is temporarily unavailable. Keep this review open and try again shortly.");
      }
      const body = await response.json().catch(() => null);
      if (response.status === 401 && auth["X-Guest-Session"]) onUnauthorized();
      throw new WidgetApiError(
        response.status,
        body?.error?.code ?? "UNKNOWN_ERROR",
        body?.error?.message ?? response.statusText,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }
    const body = await response.json() as T;
    requireOpen();
    return body;
  }

  async function upload<T>(path: string, form: FormData): Promise<T> {
    requireOpen();
    const auth = getAuthHeader();
    const response = await nativeFetch(`${apiBaseUrl}${path}`, {
      method: "POST",
      body: form,
      headers: auth,
      signal: lifetime.signal,
    });
    requireOpen();
    if (!response.ok) {
      if (response.status === 404 && response.headers.get("x-railway-fallback") === "true") {
        throw new WidgetApiError(503, "SERVICE_UNAVAILABLE", "Backline is temporarily unavailable. Keep this review open and try again shortly.");
      }
      const body = await response.json().catch(() => null);
      if (response.status === 401 && auth["X-Guest-Session"]) onUnauthorized();
      throw new WidgetApiError(
        response.status,
        body?.error?.code ?? "UNKNOWN_ERROR",
        body?.error?.message ?? response.statusText,
      );
    }
    const body = await response.json() as T;
    requireOpen();
    return body;
  }

  return { request, upload, close: () => lifetime.abort() };
}

// Shared capture helpers also accept the extension's message-based transport.
// Lifetime cancellation belongs to the concrete installed-widget client.
export type ApiClient = Pick<ReturnType<typeof createApiClient>, "request" | "upload">;
