import type { NativeReviewAuth, NativeReviewInfo, NativeReviewLaunch, Schemas } from "@backline/types";
import { API_BASE_URL, DASHBOARD_BASE_URL } from "./lib/config";
import { getConnection } from "./lib/storage";

interface ReviewSession extends NativeReviewInfo {
  auth: NativeReviewAuth;
  pageIds: string[];
  commentIds: string[];
  returnTabId?: number;
  accessEnded?: boolean;
}

const key = (tabId: number) => `review:${tabId}`;
const dashboardOrigin = new URL(DASHBOARD_BASE_URL).origin;
const origin = (url: string) => new URL(url).origin;
let activationGeneration = 0;
let reviewEpoch = 0;
const readyWaiters = new Map<string, () => void>();
const sessionWriters = new Map<number, Promise<void>>();

class NativeReviewError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

function waitForReady(launchId: string): { ready: Promise<boolean>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout>;
  const ready = new Promise<boolean>(resolve => {
    readyWaiters.set(launchId, () => { clearTimeout(timer); readyWaiters.delete(launchId); resolve(true); });
    timer = setTimeout(() => {
      readyWaiters.delete(launchId);
      // A password/SSO flow may take longer than this handshake. Keep the
      // tab-bound session so the content script can attach on return.
      resolve(false);
    }, 15000);
  });
  return { ready, cancel: () => { clearTimeout(timer); readyWaiters.delete(launchId); } };
}

async function read(tabId: number): Promise<ReviewSession | null> {
  return (await chrome.storage.session.get(key(tabId)))[key(tabId)] ?? null;
}

async function mutateSession(
  tabId: number,
  change: (current: ReviewSession | null) => ReviewSession | null | undefined,
): Promise<boolean> {
  // chrome.storage get+set is not a compare-and-swap. Serialize read/modify/write
  // so a late comment load cannot restore credentials after access ended.
  const operation = (sessionWriters.get(tabId) ?? Promise.resolve()).then(async () => {
    const next = change(await read(tabId));
    if (next === undefined) return false;
    if (next === null) await chrome.storage.session.remove(key(tabId));
    else await chrome.storage.session.set({ [key(tabId)]: next });
    return true;
  });
  const tail = operation.then(() => undefined, () => undefined);
  sessionWriters.set(tabId, tail);
  try { return await operation; }
  finally { if (sessionWriters.get(tabId) === tail) sessionWriters.delete(tabId); }
}

async function request<T>(auth: NativeReviewAuth, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "omit",
    headers: {
      ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(auth.kind === "member" ? { Authorization: `Bearer ${auth.token}` } : { "X-Guest-Session": auth.token }),
    },
  });
  if (!response.ok) {
    if (response.status === 404 && response.headers.get("x-railway-fallback") === "true") {
      throw new NativeReviewError("Backline is temporarily unavailable. Your review will stay open; try again shortly.", 503);
    }
    const body = await response.json().catch(() => null);
    throw new NativeReviewError(response.status === 401
      ? "Review access expired. Return to Backline and open browser review again."
      : body?.error?.message ?? `Backline request failed (${response.status}).`, response.status);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

async function launch(input: NativeReviewLaunch, returnTabId?: number): Promise<{ ready: boolean }> {
  const launchEpoch = reviewEpoch;
  const destination = new URL(input.url);
  if (!["http:", "https:"].includes(destination.protocol) || destination.username || destination.password) {
    throw new Error("Choose an HTTP or HTTPS website.");
  }
  if (origin(input.returnUrl) !== dashboardOrigin) throw new Error("Invalid return address.");
  let auth = input.auth;
  if (!auth) {
    const connection = await getConnection();
    if (!connection) throw new Error("Connect Backline again.");
    auth = { kind: "member", token: connection.token };
  }
  let project: NativeReviewInfo["project"];
  let authorName: string;
  if (auth.kind === "member") {
    const who = await request<Schemas["ExtensionWhoAmIOut"]>(auth, "/api/v1/extension-tokens/whoami");
    project = await request<Schemas["ProjectOut"]>(auth, `/api/v1/projects/${input.projectId}`);
    authorName = who.user_email;
  } else {
    const resolved = await request<Schemas["ReviewResolveOut"]>(auth, `/api/v1/review/${encodeURIComponent(auth.shareToken)}`);
    if (resolved.project_id !== input.projectId) throw new Error("This review belongs to another project.");
    const current = await request<Schemas["GuestSessionStatusOut"]>(auth, "/api/v1/guest-sessions/current");
    if (current.project_id !== input.projectId || current.share_link_id !== resolved.share_link_id) throw new Error("Rejoin this review in Backline first.");
    project = { id: resolved.project_id, name: resolved.project_name, target_origin: resolved.target_origin };
    authorName = auth.displayName;
  }
  if (origin(project.target_origin) !== destination.origin) throw new Error("Open a page on this project's website.");
  // Keep sessionStorage and the app's in-memory state by reusing an existing tab.
  // Do not navigate that tab away from the page the reviewer has already opened.
  const candidates = (await chrome.tabs.query({})).filter(tab => {
    try { return tab.id !== returnTabId && !!tab.url && origin(tab.url) === destination.origin; } catch { return false; }
  });
  // Backline itself can be the review target. Another portal/settings/review tab
  // is not that website page: never attach its toolbar merely by matching origin.
  const existing = candidates.find(tab => tab.url === input.url)
    ?? (destination.origin === dashboardOrigin ? undefined : candidates[0]);
  const tab = existing ?? await chrome.tabs.create({ url: "about:blank", active: true });
  if (tab.id === undefined) throw new Error("Could not open the review tab.");
  let previous: ReviewSession | null = null;
  const launchId = crypto.randomUUID();
  const waiter = waitForReady(launchId);
  // Mark handled immediately; navigation and injection can fail before the await.
  void waiter.ready.catch(() => undefined);
  try {
    await mutateSession(tab.id, current => {
      if (launchEpoch !== reviewEpoch) throw new Error("The extension connection changed. Open this review again from Backline.");
      previous = current;
      return { project, authorName, auth, member: auth.kind === "member", returnUrl: input.returnUrl,
        pageIds: [], commentIds: [], launchId, returnTabId };
    });
    if (existing) {
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      // Covers a tab opened before installation/update. The script guards duplicates.
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content-script.js"] });
      const started = await chrome.tabs.sendMessage(tab.id, { type: "native-review-start" });
      if (!started?.ok) throw new Error(started?.error ?? "Reload the website and try Browser review again.");
    } else {
      await chrome.tabs.update(tab.id, { url: destination.href });
    }
    return { ready: await waiter.ready };
  } catch (error) {
    const rolledBack = await mutateSession(tab.id, latest => latest?.launchId === launchId
      ? latest.accessEnded || launchEpoch !== reviewEpoch ? null : previous : undefined);
    if (rolledBack) {
      await chrome.tabs.sendMessage(tab.id, { type: "native-review-stop" }).catch(() => undefined);
    }
    throw error;
  } finally {
    waiter.cancel();
  }
}

async function sessionFor(sender: chrome.runtime.MessageSender): Promise<{ session: ReviewSession; tabId: number }> {
  const tabId = sender.tab?.id;
  if (tabId === undefined || sender.frameId !== 0 || !sender.url) throw new Error("Open a website review first.");
  const session = await read(tabId);
  if (!session || origin(sender.url) !== origin(session.project.target_origin)) throw new Error("No review on this page.");
  return { session, tabId };
}

async function currentReviewProject(session: ReviewSession): Promise<NativeReviewInfo["project"]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    if (session.auth.kind === "member") {
      const project = await request<Schemas["ProjectOut"]>(session.auth, `/api/v1/projects/${session.project.id}`, { signal: controller.signal });
      if (project.archived_at || project.project_type !== "website" || origin(project.target_origin) !== origin(session.project.target_origin)) {
        throw new NativeReviewError("This project is no longer available for this website review.", 403);
      }
      return { id: project.id, name: project.name, target_origin: project.target_origin, my_role: project.my_role };
    }
    const current = await request<Schemas["GuestSessionStatusOut"]>(session.auth, "/api/v1/guest-sessions/current", { signal: controller.signal });
    const resolved = await request<Schemas["ReviewResolveOut"]>(session.auth, `/api/v1/review/${encodeURIComponent(session.auth.shareToken)}`, { signal: controller.signal });
    if (current.project_id !== session.project.id || resolved.project_id !== session.project.id
      || resolved.share_link_id !== current.share_link_id || origin(resolved.target_origin) !== origin(session.project.target_origin)) {
      throw new NativeReviewError("Rejoin the project in Backline.", 403);
    }
    return { id: resolved.project_id, name: resolved.project_name, target_origin: resolved.target_origin };
  } finally {
    clearTimeout(timer);
  }
}

async function endStoredReview(session: ReviewSession, tabId: number): Promise<void> {
  await mutateSession(tabId, latest => {
    if (latest?.launchId !== session.launchId) return undefined;
    // Retain only enough local state to return/close. Ended sessions can never
    // use the API relay again; do not retain their credential or comment IDs.
    latest.accessEnded = true;
    latest.auth = { kind: "member", token: "" };
    latest.authorName = "";
    latest.project = { ...latest.project, name: "" };
    latest.pageIds = [];
    latest.commentIds = [];
    return latest;
  });
}

async function validateReviewAccess(session: ReviewSession, tabId: number): Promise<NativeReviewInfo["project"]> {
  try { return await currentReviewProject(session); }
  catch (error) {
    if (error instanceof NativeReviewError && [401, 403, 404, 409].includes(error.status)) await endStoredReview(session, tabId);
    throw error;
  }
}

async function handle(message: Record<string, unknown>, sender: chrome.runtime.MessageSender): Promise<unknown> {
  if (message.type === "native-review-status" || message.type === "native-review-launch") {
    if (sender.frameId !== 0 || !sender.url || origin(sender.url) !== dashboardOrigin) throw new Error("Open Backline to start a review.");
    if (message.type === "native-review-launch") return launch(message.input as NativeReviewLaunch, sender.tab?.id);
    const connection = await getConnection();
    return { version: 2, apiBaseUrl: API_BASE_URL, extensionVersion: chrome.runtime.getManifest().version,
      workspaceId: connection?.workspaceId ?? null, userId: connection?.userId ?? null };
  }
  if (message.type === "native-review-info") {
    try {
      const { session } = await sessionFor(sender);
      if (session.accessEnded) return null;
      const { project, authorName, member, returnUrl, launchId } = session;
      return { project, authorName, member, returnUrl, launchId } satisfies NativeReviewInfo;
    } catch { return null; }
  }
  const { session, tabId } = await sessionFor(sender);
  if (message.type === "native-review-return") {
    // Preserve the original portal tab and its latest ticket/filter query. Widget
    // page registration can update the query while this website tab is opening.
    // Focus only; never navigate a tab that has moved to another page.
    const tabs = (await chrome.tabs.query({})).filter(tab => tab.id !== tabId);
    const returnPage = new URL(session.returnUrl);
    const original = tabs.find(tab => {
      if (tab.id !== session.returnTabId || !tab.url) return false;
      try {
        const current = new URL(tab.url);
        return current.origin === returnPage.origin && current.pathname === returnPage.pathname;
      } catch { return false; }
    });
    const target = original ?? tabs.find(tab => tab.url === session.returnUrl);
    if (target?.id !== undefined) {
      await chrome.tabs.update(target.id, { active: true });
      await chrome.windows.update(target.windowId, { focused: true });
    } else {
      await chrome.tabs.create({ url: session.returnUrl, active: true });
    }
    return;
  }
  if (message.type === "native-review-ready") {
    if (session.accessEnded) throw new NativeReviewError("Review access ended. Return to Backline.", 403);
    if (message.launchId !== session.launchId) throw new Error("This review was replaced. Open it again from Backline.");
    await validateReviewAccess(session, tabId);
    readyWaiters.get(session.launchId)?.();
    return;
  }
  if (message.type === "native-review-check-access") {
    if (session.accessEnded) throw new NativeReviewError("Review access ended. Return to Backline.", 403);
    const project = await validateReviewAccess(session, tabId);
    await mutateSession(tabId, latest => {
      if (!latest || latest.launchId !== session.launchId) throw new Error("This review was replaced. Open it again from Backline.");
      if (latest.accessEnded) throw new NativeReviewError("Review access ended. Return to Backline.", 403);
      latest.project = { ...latest.project, ...project };
      return latest;
    });
    return { launchId: session.launchId, project };
  }
  if (message.type === "native-review-end") {
    if (message.launchId !== session.launchId) throw new Error("This review was replaced. Return to Backline to reopen it.");
    await mutateSession(tabId, latest => latest?.launchId === session.launchId ? null : undefined);
    return;
  }
  if (session.accessEnded) throw new NativeReviewError("Review access ended. Return to Backline.", 403);
  if (message.type === "native-review-capture") {
    const generation = activationGeneration;
    const tab = await chrome.tabs.get(tabId);
    if (!tab.active || tab.url !== message.url) throw new Error("Keep this page visible while capturing.");
    const data = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 85 });
    const after = await chrome.tabs.get(tabId);
    if (generation !== activationGeneration || !after.active || after.url !== message.url) throw new Error("The page changed during capture. Please retry.");
    return data;
  }
  if (message.type === "native-review-upload") {
    const data = message.file as { data: string; name: string; type: string };
    if (!data.data.startsWith("data:") || data.data.length > 28_000_000) throw new Error("Attachment is too large.");
    const file = await (await fetch(data.data)).blob();
    const form = new FormData();
    form.append("project_id", session.project.id);
    form.append("file", file, data.name);
    return request(session.auth, "/api/v1/uploads/direct", { method: "POST", body: form });
  }
  if (message.type === "native-review-api") {
    const path = String(message.path);
    const method = String(message.method ?? "GET");
    const body = message.body ? JSON.parse(String(message.body)) : null;
    const pageMatch = /^\/api\/v1\/pages\/([a-f0-9]{24})\/comments$/.exec(path);
    const snapshotMatch = /^\/api\/v1\/pages\/([a-f0-9]{24})\/snapshots$/.exec(path);
    const commentMatch = /^\/api\/v1\/comments\/([a-f0-9]{24})$/.exec(path);
    const replyMatch = /^\/api\/v1\/comments\/([a-f0-9]{24})\/replies$/.exec(path);
    const register = path === "/api/v1/pages" && method === "POST" && body?.project_id === session.project.id
      && typeof body.url === "string" && origin(body.url) === origin(session.project.target_origin);
    const comments = pageMatch && session.pageIds.includes(pageMatch[1]) && ["GET", "POST"].includes(method);
    const update = commentMatch && session.member && session.commentIds.includes(commentMatch[1]) && method === "PATCH";
    const snapshot = snapshotMatch && session.pageIds.includes(snapshotMatch[1]) && method === "POST";
    const reply = replyMatch && session.commentIds.includes(replyMatch[1]) && method === "POST"
      && typeof body?.body === "string" && body.body.trim().length > 0 && body.body.length <= 10_000
      && typeof body.client_request_id === "string" && body.client_request_id.length > 0 && body.client_request_id.length <= 100
      && ["body", "layer", "client_request_id"].every(field => Object.prototype.hasOwnProperty.call(body, field))
      && Object.keys(body).every(field => ["body", "layer", "client_request_id"].includes(field))
      && ["client", "team"].includes(body.layer) && (session.member || body.layer === "client");
    if (!register && !comments && !update && !snapshot && !reply) throw new Error("Request is outside this review.");
    const requestController = reply || comments && method === "GET" ? new AbortController() : null;
    const requestTimer = requestController ? setTimeout(() => requestController.abort(), 30_000) : null;
    let result: Record<string, unknown> | Record<string, unknown>[];
    try {
      result = await request<Record<string, unknown> | Record<string, unknown>[]>(session.auth, path, {
        method, ...(body ? { body: JSON.stringify(body) } : {}), ...(requestController ? { signal: requestController.signal } : {}),
      });
    } catch (error) {
      // A page-list denial is authoritative for the loaded feedback. Reply 409
      // can instead mean a request/body conflict and must retain its retry state.
      if (comments && method === "GET" && error instanceof NativeReviewError && [401, 403, 404, 409].includes(error.status)) {
        await endStoredReview(session, tabId);
      }
      throw error;
    } finally {
      if (requestTimer) clearTimeout(requestTimer);
    }
    // Keep one writer's scope additions even when capture/upload requests overlap.
    await mutateSession(tabId, latest => {
      if (!latest || latest.accessEnded || latest.launchId !== session.launchId || latest.auth.token !== session.auth.token) return undefined;
      if (register && !Array.isArray(result)) latest.pageIds = [...new Set([...latest.pageIds, String(result.id)])];
      if (comments || reply) latest.commentIds = [...new Set([...latest.commentIds, ...(Array.isArray(result) ? result : [result]).map(c => String(c.id))])];
      return latest;
    });
    return result;
  }
  throw new Error("Unknown review action.");
}

export function registerNativeReview(): void {
  chrome.tabs.onActivated.addListener(() => { activationGeneration += 1; });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (typeof message?.type !== "string" || !message.type.startsWith("native-review-")) return false;
    void handle(message, sender).then(data => respond({ ok: true, data }), error => respond({ ok: false, error: error instanceof Error ? error.message : "Review failed.", status: error instanceof NativeReviewError ? error.status : 0 }));
    return true;
  });
  chrome.tabs.onRemoved.addListener(tabId => { void mutateSession(tabId, () => null); });
}

export async function clearNativeReviews(): Promise<void> {
  reviewEpoch += 1;
  const entries = await chrome.storage.session.get(null);
  const keys = Object.keys(entries).filter(name => name.startsWith("review:"));
  await Promise.all(keys.map(name => mutateSession(Number(name.slice(7)), () => null)));
  await Promise.all(keys.map(name => chrome.tabs.sendMessage(Number(name.slice(7)), { type: "native-review-stop" })
    .catch(() => undefined)));
}
