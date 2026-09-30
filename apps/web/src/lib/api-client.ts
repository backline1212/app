import { getAccessToken, setAccessToken } from "./auth-token";
import { decodeAccessToken } from "./jwt";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const REFRESH_PATH = "/api/v1/auth/refresh";
const SWITCH_PATH = "/api/v1/auth/switch-workspace";
/** Fired when the member can no longer open the workspace their session is in (they
 * were removed); AuthProvider refreshes the workspace list, which routes them out. */
export const WORKSPACE_ACCESS_LOST_EVENT = "backline:workspace-access-lost";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

async function rawRequest(path: string, init?: RequestInit): Promise<Response> {
  const token = getAccessToken();
  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: "include", // sends/receives the httpOnly refresh_token cookie (13-Authentication.md §13.6)
      headers: {
        ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
  } catch (error) {
    // An abort is the caller's own doing; anything else is the browser's bare
    // "Failed to fetch", which says nothing to a reviewer.
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "NETWORK_ERROR", "Can't reach Backline. Check your connection and try again.");
  }
}

type RefreshResult = { ok: true; body: { access_token: string } } | { ok: false; error: ApiError };
let refreshInFlight: Promise<RefreshResult> | null = null;

// Every /auth/refresh goes through this one request at a time. Refresh tokens rotate,
// and two concurrent refreshes with the same cookie trip the server's reuse detection,
// which revokes the whole session: the start-up restore (refreshSession below) and a
// 401 retry from a page that fires a request on mount used to race exactly like that.
function refreshOnce(): Promise<RefreshResult> {
  refreshInFlight ??= (async (): Promise<RefreshResult> => {
    try {
      const response = await rawRequest(REFRESH_PATH, { method: "POST" });
      if (!response.ok) {
        setAccessToken(null);
        return { ok: false, error: await toApiError(response) };
      }
      const body = (await response.json()) as { access_token: string };
      setAccessToken(body.access_token);
      return { ok: true, body };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof ApiError ? error : new ApiError(0, "NETWORK_ERROR", "Can't reach Backline."),
      };
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function refreshAccessToken(): Promise<boolean> {
  return (await refreshOnce()).ok;
}

/** Restores the session from the httpOnly refresh cookie; shares any refresh already in
 * flight. Resolves with the refresh response body, or throws its error. */
export async function refreshSession<T>(): Promise<T> {
  const result = await refreshOnce();
  if (!result.ok) throw result.error;
  return result.body as T;
}

let reopenInFlight: Promise<boolean> | null = null;

// The member's role changed (or they were removed) after this access token was
// issued, and the API refuses a token whose role is stale. Switching into the same
// workspace again issues one with the current role; if that is refused too, they
// are no longer a member.
async function reopenWorkspace(): Promise<boolean> {
  const workspaceId = decodeAccessToken(getAccessToken() ?? "")?.workspace_id;
  if (!workspaceId) return false;
  reopenInFlight ??= (async () => {
    try {
      const response = await rawRequest(SWITCH_PATH, {
        method: "POST",
        body: JSON.stringify({ workspace_id: workspaceId }),
      });
      if (!response.ok) {
        window.dispatchEvent(new Event(WORKSPACE_ACCESS_LOST_EVENT));
        return false;
      }
      setAccessToken(((await response.json()) as { access_token: string }).access_token);
      return true;
    } finally {
      reopenInFlight = null;
    }
  })();
  return reopenInFlight;
}

// A 401 (AuthenticationError, 06-Backend-Architecture.md §6.7) means the access
// token is missing/expired - worth exactly one silent refresh-and-retry. A 403 is
// surfaced as-is, except WORKSPACE_ACCESS_CHANGED: the session is fine but its role
// is stale, so the workspace is reopened once and the request retried.
async function send(path: string, init?: RequestInit): Promise<Response> {
  let response = await rawRequest(path, init);
  if (response.status === 401 && path !== REFRESH_PATH) {
    const refreshed = await refreshAccessToken();
    if (refreshed) response = await rawRequest(path, init);
  }
  if (response.status === 403 && path !== SWITCH_PATH) {
    const code = await response
      .clone()
      .json()
      .then((body: { error?: { code?: string } } | null) => body?.error?.code)
      .catch(() => undefined);
    if (code === "WORKSPACE_ACCESS_CHANGED" && (await reopenWorkspace())) {
      response = await rawRequest(path, init);
    }
  }
  return response;
}

// FastAPI's own errors (a request that fails schema validation, an HTTPException)
// arrive as {"detail": ...} rather than Backline's {"error": {...}} envelope.
function detailMessage(detail: unknown): string | null {
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { loc?: unknown[]; msg?: unknown };
    if (typeof first?.msg !== "string") return null;
    const field = Array.isArray(first.loc)
      ? first.loc.filter((part) => !["body", "query", "path"].includes(String(part))).join(".")
      : "";
    return field ? `${field}: ${first.msg}` : first.msg;
  }
  return null;
}

// HTTP/2 responses carry no reason phrase, so statusText is "" in production: an
// error page that isn't JSON used to surface as an empty message.
function fallbackMessage(status: number): string {
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return "That couldn't be found. It may have been deleted.";
  if (status === 413) return "That's too large to upload.";
  if (status === 429) return "Too many requests. Wait a moment and try again.";
  if (status >= 500) return "Backline hit a server error. Try again in a moment.";
  return `The request failed (${status}).`;
}

async function toApiError(response: Response): Promise<ApiError> {
  const body = await response.json().catch(() => null);
  const code = body?.error?.code ?? (response.status === 422 ? "VALIDATION_ERROR" : "UNKNOWN_ERROR");
  const message = body?.error?.message || detailMessage(body?.detail) || fallbackMessage(response.status);
  return new ApiError(response.status, code, message, body?.error?.details ?? {});
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await send(path, init);

  if (!response.ok) {
    throw await toApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function apiFetchBlob(path: string, init?: RequestInit): Promise<Blob> {
  const response = await send(path, init);
  if (!response.ok) throw await toApiError(response);
  return response.blob();
}
