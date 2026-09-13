// The one piece of state this extension keeps: the token + workspace context from the
// last successful "paste your token" connect (popup.ts). Read/written only through the
// background service worker (background.ts) - see messages.ts - so there's a single
// place that owns it, ready for Phase 4/5 to broadcast a change to every open content
// script (e.g. on disconnect) without content scripts polling chrome.storage themselves.
export interface ExtensionConnection {
  token: string;
  userId: string;
  userEmail: string;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
}

const STORAGE_KEY = "backline:connection";

export async function getConnection(): Promise<ExtensionConnection | null> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as ExtensionConnection | undefined) ?? null;
}

export async function setConnection(connection: ExtensionConnection): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: connection });
}

export async function clearConnection(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}
