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
) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await nativeFetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
        ...init.headers,
      },
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new WidgetApiError(
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

  async function upload<T>(path: string, form: FormData): Promise<T> {
    const response = await nativeFetch(`${apiBaseUrl}${path}`, {
      method: "POST",
      body: form,
      headers: getAuthHeader(),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new WidgetApiError(
        response.status,
        body?.error?.code ?? "UNKNOWN_ERROR",
        body?.error?.message ?? response.statusText,
      );
    }
    return response.json() as Promise<T>;
  }

  return { request, upload };
}

export type ApiClient = ReturnType<typeof createApiClient>;
