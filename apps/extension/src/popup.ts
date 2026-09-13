import type { Schemas } from "@backline/types";

import { apiRequest, ExtensionApiError } from "./lib/api";
import { DASHBOARD_BASE_URL } from "./lib/config";
import type { AnnotationMode, ConnectionResponse, ExtensionMessage } from "./lib/messages";
import type { ExtensionConnection } from "./lib/storage";

function sendMessage<T>(message: ExtensionMessage): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id} in popup.html`);
  return found as T;
}

const disconnectedView = el<HTMLDivElement>("disconnected-view");
const connectedView = el<HTMLDivElement>("connected-view");
const connectForm = el<HTMLFormElement>("connect-form");
const tokenInput = el<HTMLInputElement>("token-input");
const statusEl = el<HTMLParagraphElement>("status");
const getTokenLink = el<HTMLButtonElement>("get-token-link");
const connectedEmail = el<HTMLSpanElement>("connected-email");
const connectedWorkspace = el<HTMLSpanElement>("connected-workspace");
const disconnectBtn = el<HTMLButtonElement>("disconnect-btn");
const activatePointBtn = el<HTMLButtonElement>("activate-point-btn");
const activateRegionBtn = el<HTMLButtonElement>("activate-region-btn");
const activateStatus = el<HTMLParagraphElement>("activate-status");
const activityList = el<HTMLUListElement>("activity-list");
const activityEmpty = el<HTMLParagraphElement>("activity-empty");
const openDashboardBtn = el<HTMLButtonElement>("open-dashboard-btn");

function setStatus(message: string): void {
  statusEl.textContent = message;
}

async function getCurrentTabOrigin(): Promise<string | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return null;
  try {
    return new URL(tab.url).origin;
  } catch {
    return null;
  }
}

function renderActivity(comments: Schemas["CommentOut"][]): void {
  activityList.innerHTML = "";
  const topLevel = comments
    .filter((c) => c.parent_id === null)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5);

  if (topLevel.length === 0) {
    activityEmpty.textContent = "No comments on this site yet.";
    return;
  }
  activityEmpty.textContent = "";
  for (const comment of topLevel) {
    const item = document.createElement("li");
    const author = document.createElement("div");
    author.className = "activity-author";
    author.textContent = comment.author_name;
    const body = document.createElement("div");
    body.className = "activity-body";
    body.textContent = comment.body;
    item.append(author, body);
    activityList.append(item);
  }
}

async function loadActivity(connection: ExtensionConnection): Promise<void> {
  activityEmpty.textContent = "Loading...";
  activityList.innerHTML = "";
  // "Open in dashboard" always has somewhere useful to go, even before a project
  // exists for this site - the workspace root rather than a dead link.
  let dashboardPath = `/w/${connection.workspaceSlug}`;

  try {
    const origin = await getCurrentTabOrigin();
    const projects = await apiRequest<Schemas["ProjectOut"][]>(
      `/api/v1/workspaces/${connection.workspaceId}/projects`,
      connection.token,
    );
    const project = origin ? projects.find((p) => p.target_origin === origin) : undefined;

    if (!project) {
      activityEmpty.textContent = origin
        ? "No project yet for this site - click Add comment or Draw region to create one."
        : "Open a regular webpage to see its Backline activity.";
    } else {
      dashboardPath = `/w/${connection.workspaceSlug}/p/${project.id}/board`;
      const comments = await apiRequest<Schemas["CommentOut"][]>(
        `/api/v1/projects/${project.id}/comments`,
        connection.token,
      );
      renderActivity(comments);
    }
  } catch (err) {
    activityEmpty.textContent =
      err instanceof ExtensionApiError ? err.message : "Could not load activity.";
  }

  openDashboardBtn.onclick = () => {
    chrome.tabs.create({ url: `${DASHBOARD_BASE_URL}${dashboardPath}` });
  };
}

function renderConnected(connection: ExtensionConnection): void {
  connectedEmail.textContent = connection.userEmail;
  connectedWorkspace.textContent = connection.workspaceName;
  connectedView.style.display = "block";
  disconnectedView.style.display = "none";
  void loadActivity(connection);
}

function renderDisconnected(): void {
  connectedView.style.display = "none";
  disconnectedView.style.display = "block";
  setStatus("");
  tokenInput.value = "";
}

async function handleConnectSubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const token = tokenInput.value.trim();
  if (!token) return;

  setStatus("Connecting...");
  try {
    const whoami = await apiRequest<Schemas["ExtensionWhoAmIOut"]>(
      "/api/v1/extension-tokens/whoami",
      token,
    );
    const connection: ExtensionConnection = {
      token,
      userId: whoami.user_id,
      userEmail: whoami.user_email,
      workspaceId: whoami.workspace.id,
      workspaceName: whoami.workspace.name,
      workspaceSlug: whoami.workspace.slug,
    };
    await sendMessage<ConnectionResponse>({ type: "set-connection", connection });
    renderConnected(connection);
  } catch (err) {
    setStatus(
      err instanceof ExtensionApiError
        ? err.message
        : "Could not connect. Check the token and try again.",
    );
  }
}

async function handleDisconnect(): Promise<void> {
  await sendMessage<ConnectionResponse>({ type: "clear-connection" });
  renderDisconnected();
}

async function handleActivate(mode: AnnotationMode): Promise<void> {
  activateStatus.textContent = "";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    activateStatus.textContent = "Could not find the current tab.";
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "activate-annotation", mode });
    window.close();
  } catch {
    // The content script isn't injected on chrome://, the Chrome Web Store, or a page
    // that hasn't finished loading yet - no manifest permission fixes that, so this is
    // just surfaced to the user rather than retried.
    activateStatus.textContent = "Backline can't run on this page.";
  }
}

connectForm.addEventListener("submit", (event) => void handleConnectSubmit(event));
disconnectBtn.addEventListener("click", () => void handleDisconnect());
activatePointBtn.addEventListener("click", () => void handleActivate("point"));
activateRegionBtn.addEventListener("click", () => void handleActivate("region"));
getTokenLink.addEventListener("click", () => {
  chrome.tabs.create({ url: DASHBOARD_BASE_URL });
});

async function init(): Promise<void> {
  const { connection } = await sendMessage<ConnectionResponse>({ type: "get-connection" });
  if (connection) {
    renderConnected(connection);
  } else {
    renderDisconnected();
  }
}

void init();
