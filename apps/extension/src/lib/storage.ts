// The one piece of state this extension keeps: the token + workspace context from the
// current member connection (manual popup or dashboard browser review). Only the
// extension holds this token; reviewed pages cannot access chrome.storage.
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
