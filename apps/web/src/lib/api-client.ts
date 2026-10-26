import { getAccessContextRevision, getAccessToken, getAccessTokenRevision, setAccessToken } from "./auth-token";
import { decodeAccessToken } from "./jwt";
import type { AccessTokenPayload } from "./jwt";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const REFRESH_PATH = "/api/v1/auth/refresh";
const SWITCH_PATH = "/api/v1/auth/switch-workspace";
// Railway's edge returns a 404 before FastAPI when the API service/domain is
// unavailable. It is not a missing workspace, login or review resource.
const isServiceFallback = (response: Response): boolean =>
  response.status === 404 && response.headers.get("x-railway-fallback") === "true";
// Invalid credentials/codes are final responses, not expired member sessions.
const SIGN_IN_PATHS = new Set([
  REFRESH_PATH, "/api/v1/auth/login", "/api/v1/auth/signup",
  "/api/v1/auth/signup/verify", "/api/v1/auth/otp/request",
  "/api/v1/auth/otp/verify", "/api/v1/auth/google/start",
  "/api/v1/auth/google/callback", "/api/v1/auth/logout",
]);
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

function sessionChanged(): ApiError {
  return new ApiError(409, "SESSION_CHANGED", "Your account or workspace changed. Check the current page before trying again.");
}

function requireRequestContext(previous: AccessTokenPayload | null, contextRevision: number): void {
  const current = decodeAccessToken(getAccessToken() ?? "");
  if (contextRevision !== getAccessContextRevision() || !previous || !current || current.sub !== previous.sub || current.workspace_id !== previous.workspace_id) throw sessionChanged();
}

/** Stop only this caller's wait; another request may still need the shared refresh. */
function waitForSession<T>(pending: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return pending;
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException("Request cancelled", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    if (signal.aborted) { signal.removeEventListener("abort", abort); abort(); }
  });
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
    if (init?.signal?.aborted) throw init.signal.reason ?? error;
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "NETWORK_ERROR", "Can't reach Backline right now. Check your connection or try again later.");
  }
}

type RefreshResult = { ok: true; body: { access_token: string } } | { ok: false; error: ApiError };
let refreshInFlight: Promise<RefreshResult> | null = null;

async function performRefresh(revision: number, previous: AccessTokenPayload | null): Promise<RefreshResult> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20_000);
  const requireCurrentSession = () => {
    if (revision !== getAccessTokenRevision()) {
      throw new ApiError(409, "SESSION_CHANGED", "Your session changed. Try again.");
    }
  };
  try {
    // A tab may have waited behind another tab's rotating-cookie request.
    requireCurrentSession();
    const response = await rawRequest(REFRESH_PATH, { method: "POST", signal: controller.signal });
    requireCurrentSession();
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) setAccessToken(null);
      return { ok: false, error: await toApiError(response) };
    }
    const body = (await response.json()) as { access_token: string };
    requireCurrentSession();
    const renewed = decodeAccessToken(body.access_token);
    if (!renewed?.sub || (previous && renewed.sub !== previous.sub)) {
      setAccessToken(null);
      return { ok: false, error: new ApiError(401, "SESSION_CHANGED", "Sign in again to continue.") };
    }
    // Refresh tokens deliberately have no workspace. Restore the old context
    // before releasing waiting requests, so they cannot retry unscoped.
    if (previous?.workspace_id) {
      const scoped = await rawRequest(SWITCH_PATH, {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${body.access_token}` },
        body: JSON.stringify({ workspace_id: previous.workspace_id }),
      });
      requireCurrentSession();
      if (!scoped.ok) {
        if (scoped.status === 403 || (scoped.status === 404 && !isServiceFallback(scoped))) {
          setAccessToken(body.access_token);
          window.dispatchEvent(new Event(WORKSPACE_ACCESS_LOST_EVENT));
        }
        return { ok: false, error: await toApiError(scoped) };
      }
      const restored = (await scoped.json()) as { access_token: string };
      requireCurrentSession();
      const scopedIdentity = decodeAccessToken(restored.access_token);
      if (scopedIdentity?.sub !== renewed.sub || scopedIdentity.workspace_id !== previous.workspace_id) throw sessionChanged();
      body.access_token = restored.access_token;
    }
    setAccessToken(body.access_token);
    return { ok: true, body };
  } catch (error) {
    return {
      ok: false,
      error: controller.signal.aborted
        ? new ApiError(0, "SESSION_REFRESH_TIMEOUT", "Session refresh timed out. Try again.")
        : error instanceof ApiError ? error : new ApiError(0, "NETWORK_ERROR", "Can't reach Backline."),
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

// Share one promise in this tab and serialize rotating-cookie requests across tabs
// on this origin. Access tokens remain private to each tab's memory. Browsers without
// Web Locks retain the single-tab guard; they need separate compatibility evidence.
function refreshOnce(): Promise<RefreshResult> {
  if (refreshInFlight) return refreshInFlight;
  const revision = getAccessTokenRevision();
  const previous = decodeAccessToken(getAccessToken() ?? "");
  const queued = new AbortController();
  // A suspended tab can hold the origin lock. Bound waiting for it independently
  // of the existing 20-second HTTP deadline after acquisition.
  const queueTimeout = window.setTimeout(() => queued.abort(), 20_000);
  const execute = () => {
    window.clearTimeout(queueTimeout);
    return performRefresh(revision, previous);
  };
  const pending = navigator.locks
    ? navigator.locks.request("backline:auth-refresh", { signal: queued.signal }, execute)
    : execute();
  refreshInFlight = pending
    .catch((error: unknown): RefreshResult => ({
      ok: false,
      error: queued.signal.aborted
        ? new ApiError(0, "SESSION_REFRESH_BUSY", "Another Backline tab is still refreshing your session. Try again shortly.")
        : error instanceof ApiError ? error : new ApiError(0, "SESSION_REFRESH_FAILED", "Session refresh couldn't finish. Try again."),
    }))
    .finally(() => { window.clearTimeout(queueTimeout); refreshInFlight = null; });
  return refreshInFlight;
}

/** Restores the session from the httpOnly refresh cookie; shares any refresh already in
 * flight. Resolves with the refresh response body, or throws its error. */
export async function refreshSession<T>(): Promise<T> {
  const result = await refreshOnce();
  if (!result.ok) throw result.error;
  return result.body as T;
}

let reopenInFlight: { revision: number; promise: Promise<boolean> } | null = null;

// The member's role changed (or they were removed) after this access token was
// issued, and the API refuses a token whose role is stale. Switching into the same
// workspace again issues one with the current role; if that is refused too, they
// are no longer a member.
async function reopenWorkspace(): Promise<boolean> {
  const previous = decodeAccessToken(getAccessToken() ?? "");
  const workspaceId = previous?.workspace_id;
  if (!workspaceId) return false;
  const revision = getAccessTokenRevision();
  if (reopenInFlight?.revision === revision) return reopenInFlight.promise;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20_000);
  const requireCurrent = () => {
    if (revision !== getAccessTokenRevision()) throw sessionChanged();
  };
  const promise = (async () => {
    try {
      const response = await rawRequest(SWITCH_PATH, {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({ workspace_id: workspaceId }),
      });
      requireCurrent();
      if (!response.ok) {
        if (response.status === 403 || (response.status === 404 && !isServiceFallback(response))) {
          window.dispatchEvent(new Event(WORKSPACE_ACCESS_LOST_EVENT));
        }
        throw await toApiError(response);
      }
      const body = (await response.json()) as { access_token: string };
      requireCurrent();
      const renewed = decodeAccessToken(body.access_token);
      if (renewed?.sub !== previous.sub || renewed.workspace_id !== workspaceId) throw sessionChanged();
      setAccessToken(body.access_token);
      return true;
    } catch (error) {
      if (controller.signal.aborted) throw new ApiError(0, "WORKSPACE_REOPEN_TIMEOUT", "Checking workspace access timed out. Try again.");
      throw error;
    } finally {
      window.clearTimeout(timeout);
      if (reopenInFlight?.revision === revision) reopenInFlight = null;
    }
  })();
  reopenInFlight = { revision, promise };
  return promise;
}

// A 401 (AuthenticationError, 06-Backend-Architecture.md §6.7) means the access
// token is missing/expired - worth exactly one silent refresh-and-retry. A 403 is
// surfaced as-is, except WORKSPACE_ACCESS_CHANGED: the session is fine but its role
// is stale, so the workspace is reopened once and the request retried.
async function send(path: string, init?: RequestInit): Promise<Response> {
  const previous = decodeAccessToken(getAccessToken() ?? "");
  const revision = getAccessTokenRevision();
  const contextRevision = getAccessContextRevision();
  let response = await rawRequest(path, init);
  if (response.status === 401 && previous && !SIGN_IN_PATHS.has(path)) {
    requireRequestContext(previous, contextRevision);
    init?.signal?.throwIfAborted();
    if (revision === getAccessTokenRevision()) {
      const refreshed = await waitForSession(refreshOnce(), init?.signal);
      if (!refreshed.ok) throw refreshed.error;
    }
    // Another request may already have refreshed this token. Never replay this
    // request under a later login or a different active workspace.
    requireRequestContext(previous, contextRevision);
    init?.signal?.throwIfAborted();
    response = await rawRequest(path, init);
  }
  if (response.status === 403 && path !== SWITCH_PATH && !SIGN_IN_PATHS.has(path)) {
    const code = await response
      .clone()
      .json()
      .then((body: { error?: { code?: string } } | null) => body?.error?.code)
      .catch(() => undefined);
    if (code === "WORKSPACE_ACCESS_CHANGED") {
      requireRequestContext(previous, contextRevision);
      init?.signal?.throwIfAborted();
      if (await waitForSession(reopenWorkspace(), init?.signal)) {
        requireRequestContext(previous, contextRevision);
        init?.signal?.throwIfAborted();
        response = await rawRequest(path, init);
      }
    }
  }
  return response;
}

// FastAPI's own errors (a request that fails schema validation, an HTTPException)
// arrive as {"detail": ...} rather than Backline's {"error": {...}} envelope.
function detailMessage(detail: unknown): string | null {
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { loc?: unknown[]; msg?: unknown; type?: unknown; ctx?: Record<string, unknown> };
    if (typeof first?.msg !== "string") return null;
    const parts = Array.isArray(first.loc)
      ? first.loc.filter((part) => !["body", "query", "path"].includes(String(part)) && typeof part !== "number")
      : [];
    return validationCopy(String(parts[parts.length - 1] ?? ""), first.msg, String(first.type ?? ""), first.ctx ?? {});
  }
  return null;
}

// Pydantic's wording ("value is not a valid email address: The part after the @-sign is
// a special-use or reserved name...") is for developers; people see a short sentence.
function validationCopy(field: string, msg: string, type: string, ctx: Record<string, unknown>): string {
  const label = field ? field.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "";
  if (/email/i.test(field) || /valid email/i.test(msg)) return "Enter a valid email address.";
  if (!label) return msg;
  if (type === "missing") return `${label} is required.`;
  if (type === "string_too_short") return Number(ctx.min_length) <= 1 ? `${label} can't be empty.` : `${label} must be at least ${String(ctx.min_length)} characters.`;
  if (type === "string_too_long") return `${label} can be at most ${String(ctx.max_length)} characters.`;
  if (type === "url_parsing" || type === "url_scheme") return `${label} must be a full web address, like https://example.com.`;
  return `${label}: ${msg.replace(/^Value error, /, "")}`;
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

export async function toApiError(response: Response, fallbackCode?: string, fallbackCopy?: string): Promise<ApiError> {
  if (isServiceFallback(response)) {
    return new ApiError(503, "SERVICE_UNAVAILABLE", "Backline is temporarily unavailable. Try again shortly.");
  }
  const body = await response.json().catch(() => null);
  const code = body?.error?.code ?? fallbackCode ?? (response.status === 422 ? "VALIDATION_ERROR" : "UNKNOWN_ERROR");
  const message = body?.error?.message || detailMessage(body?.detail) || fallbackCopy || fallbackMessage(response.status);
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
