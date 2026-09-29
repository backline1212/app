import type { NativeReviewAuth, NativeReviewInfo, NativeReviewLaunch, Schemas } from "@backline/types";
import { API_BASE_URL, DASHBOARD_BASE_URL } from "./lib/config";
import { getConnection, setConnection } from "./lib/storage";

interface ReviewSession extends NativeReviewInfo {
  auth: NativeReviewAuth;
  pageIds: string[];
  commentIds: string[];
}

const key = (tabId: number) => `review:${tabId}`;
const dashboardOrigin = new URL(DASHBOARD_BASE_URL).origin;
const origin = (url: string) => new URL(url).origin;
let activationGeneration = 0;

async function read(tabId: number): Promise<ReviewSession | null> {
  return (await chrome.storage.session.get(key(tabId)))[key(tabId)] ?? null;
}

async function save(tabId: number, session: ReviewSession): Promise<void> {
  await chrome.storage.session.set({ [key(tabId)]: session });
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
    const body = await response.json().catch(() => null);
    throw new Error(response.status === 401
      ? "Review access expired. Return to Backline and open browser review again."
      : body?.error?.message ?? `Backline request failed (${response.status}).`);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

async function launch(input: NativeReviewLaunch): Promise<void> {
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
  let validatedConnection: Awaited<ReturnType<typeof getConnection>> = null;
  if (auth.kind === "member") {
    const who = await request<Schemas["ExtensionWhoAmIOut"]>(auth, "/api/v1/extension-tokens/whoami");
    project = await request<Schemas["ProjectOut"]>(auth, `/api/v1/projects/${input.projectId}`);
    authorName = who.user_email;
    validatedConnection = { token: auth.token, userId: who.user_id, userEmail: who.user_email,
      workspaceId: who.workspace.id, workspaceName: who.workspace.name, workspaceSlug: who.workspace.slug };
  } else {
    const resolved = await request<Schemas["ReviewResolveOut"]>(auth, `/api/v1/review/${encodeURIComponent(auth.shareToken)}`);
    if (resolved.project_id !== input.projectId) throw new Error("This review belongs to another project.");
    project = { id: resolved.project_id, name: resolved.project_name, target_origin: resolved.target_origin };
    authorName = auth.displayName;
  }
  if (origin(project.target_origin) !== destination.origin) throw new Error("Open a page on this project's website.");
  // Keep sessionStorage and the app's in-memory state by reusing an existing tab.
  // Do not navigate that tab away from the page the reviewer has already opened.
  const candidates = (await chrome.tabs.query({})).filter(tab => {
    try { return !!tab.url && origin(tab.url) === destination.origin; } catch { return false; }
  });
  const existing = candidates.find(tab => tab.url === input.url) ?? candidates[0];
  const tab = existing ?? await chrome.tabs.create({ url: "about:blank", active: true });
  if (tab.id === undefined) throw new Error("Could not open the review tab.");
  const previous = await read(tab.id);
  await save(tab.id, { project, authorName, auth, member: auth.kind === "member", returnUrl: input.returnUrl,
    pageIds: [], commentIds: [] });
  try {
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
    if (validatedConnection) await setConnection(validatedConnection);
  } catch (error) {
    if (previous) await save(tab.id, previous);
    else await chrome.storage.session.remove(key(tab.id));
    if (!existing) await chrome.tabs.remove(tab.id).catch(() => undefined);
    throw error;
  }
}

async function sessionFor(sender: chrome.runtime.MessageSender): Promise<{ session: ReviewSession; tabId: number }> {
  const tabId = sender.tab?.id;
  if (tabId === undefined || sender.frameId !== 0 || !sender.url) throw new Error("Open a website review first.");
  const session = await read(tabId);
  if (!session || origin(sender.url) !== origin(session.project.target_origin)) throw new Error("No review on this page.");
  return { session, tabId };
}

async function handle(message: Record<string, unknown>, sender: chrome.runtime.MessageSender): Promise<unknown> {
  if (message.type === "native-review-status" || message.type === "native-review-launch") {
    if (sender.frameId !== 0 || !sender.url || origin(sender.url) !== dashboardOrigin) throw new Error("Open Backline to start a review.");
    if (message.type === "native-review-launch") return launch(message.input as NativeReviewLaunch);
    const connection = await getConnection();
    return { version: 1, workspaceId: connection?.workspaceId ?? null, userId: connection?.userId ?? null };
  }
  if (message.type === "native-review-info") {
    try {
      const { session: { project, authorName, member, returnUrl } } = await sessionFor(sender);
      return { project, authorName, member, returnUrl } satisfies NativeReviewInfo;
    } catch { return null; }
  }
  const { session, tabId } = await sessionFor(sender);
  if (message.type === "native-review-end") {
    await chrome.storage.session.remove(key(tabId));
    return;
  }
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
    const commentMatch = /^\/api\/v1\/comments\/([a-f0-9]{24})$/.exec(path);
    const register = path === "/api/v1/pages" && method === "POST" && body?.project_id === session.project.id
      && typeof body.url === "string" && origin(body.url) === origin(session.project.target_origin);
    const comments = pageMatch && session.pageIds.includes(pageMatch[1]) && ["GET", "POST"].includes(method);
    const update = commentMatch && session.member && session.commentIds.includes(commentMatch[1]) && method === "PATCH";
    if (!register && !comments && !update) throw new Error("Request is outside this review.");
    const result = await request<Record<string, unknown> | Record<string, unknown>[]>(session.auth, path, {
      method, ...(body ? { body: JSON.stringify(body) } : {}),
    });
    // Keep one writer's scope additions even when capture/upload requests overlap.
    const latest = await read(tabId);
    if (latest && latest.auth.token === session.auth.token && latest.project.id === session.project.id) {
      if (register && !Array.isArray(result)) latest.pageIds = [...new Set([...latest.pageIds, String(result.id)])];
      if (comments) latest.commentIds = [...new Set([...latest.commentIds, ...(Array.isArray(result) ? result : [result]).map(c => String(c.id))])];
      await save(tabId, latest);
    }
    return result;
  }
  throw new Error("Unknown review action.");
}

export function registerNativeReview(): void {
  chrome.tabs.onActivated.addListener(() => { activationGeneration += 1; });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (typeof message?.type !== "string" || !message.type.startsWith("native-review-")) return false;
    void handle(message, sender).then(data => respond({ ok: true, data }), error => respond({ ok: false, error: error instanceof Error ? error.message : "Review failed." }));
    return true;
  });
  chrome.tabs.onRemoved.addListener(tabId => { void chrome.storage.session.remove(key(tabId)); });
}

export async function clearNativeReviews(): Promise<void> {
  const entries = await chrome.storage.session.get(null);
  const keys = Object.keys(entries).filter(name => name.startsWith("review:"));
  await chrome.storage.session.remove(keys);
  await Promise.all(keys.map(name => chrome.tabs.sendMessage(Number(name.slice(7)), { type: "native-review-stop" })
    .catch(() => undefined)));
}
