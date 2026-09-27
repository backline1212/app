import type { Schemas } from "@backline/types";

import { apiRequest, ExtensionApiError } from "./lib/api";
import type {
  ConnectionResponse,
  ExtensionMessage,
  SessionCookieIn,
  SyncSessionResponse,
} from "./lib/messages";
import { clearConnection, getConnection, setConnection } from "./lib/storage";

// The single owner of connection state (see storage.ts/messages.ts docstrings) - the
// popup and content script only ever read/write it through these three messages.
chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === "get-connection") {
    getConnection().then((connection) => sendResponse({ connection } satisfies ConnectionResponse));
    return true; // keeps the message channel open for the async response above
  }

  if (message.type === "set-connection") {
    setConnection(message.connection).then(() =>
      sendResponse({ connection: message.connection } satisfies ConnectionResponse),
    );
    return true;
  }

  if (message.type === "clear-connection") {
    clearConnection().then(() => sendResponse({ connection: null } satisfies ConnectionResponse));
    return true;
  }

  if (message.type === "sync-session") {
    syncSession(message.tabId, message.projectId, message.targetOrigin).then(sendResponse);
    return true;
  }

  return false;
});

// chrome.cookies.getAll sees a site's real cookie jar, HttpOnly included - the one place
// this is possible outside the site's own server, since a content script's document.cookie
// is (correctly) blind to HttpOnly, and the proxy's own server-side fetch never held a
// signed-in session in the first place. This only reads; nothing is written back to the
// site (docs/tdr/0041).
async function readCookies(targetOrigin: string): Promise<SessionCookieIn[]> {
  const cookies = await chrome.cookies.getAll({ url: targetOrigin });
  return cookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    path: cookie.path,
    // A session cookie (cleared on browser close) has no expirationDate at all - carrying
    // one into the ticket as if it were persistent would outlive what the site itself
    // intended, so it's dropped rather than guessed at.
    expires: cookie.session ? null : (cookie.expirationDate ?? null),
    http_only: cookie.httpOnly,
  }));
}

async function readLocalStorage(tabId: number): Promise<{ key: string; value: string }[]> {
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const items: { key: string; value: string }[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key === null) continue;
        items.push({ key, value: localStorage.getItem(key) ?? "" });
      }
      return items;
    },
  });
  return injection?.result ?? [];
}

async function syncSession(
  tabId: number,
  projectId: string,
  targetOrigin: string,
): Promise<SyncSessionResponse> {
  const connection = await getConnection();
  if (!connection) return { ok: false, error: "Connect the extension first." };

  try {
    const [cookies, localStorageItems] = await Promise.all([
      readCookies(targetOrigin),
      readLocalStorage(tabId),
    ]);
    if (cookies.length === 0 && localStorageItems.length === 0) {
      return { ok: false, error: "No cookies or saved sign-in data found on this page." };
    }

    const ticket = await apiRequest<Schemas["SessionSyncTicketOut"]>(
      `/api/v1/projects/${projectId}/session-sync`,
      connection.token,
      {
        method: "POST",
        body: JSON.stringify({ cookies, local_storage: localStorageItems }),
      },
    );

    // Redeeming has to happen in a real browsing context on the preview origin itself -
    // that's what makes the Set-Cookie response land in the browser's actual cookie jar
    // for that origin, and what lets the redeem page's own inline script write
    // localStorage there. The canvas iframe shares that same origin, so it picks up both
    // the next time it (re)loads - this tab never needs to be shown to the member.
    const redeemTab = await chrome.tabs.create({ url: ticket.redeem_url, active: false });
    if (redeemTab.id !== undefined) {
      const tabToClose = redeemTab.id;
      setTimeout(() => {
        chrome.tabs.remove(tabToClose).catch(() => {
          // Already closed (the member closed it, or the browser reclaimed it) - fine.
        });
      }, 2500);
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof ExtensionApiError ? err.message : "Could not sync this session.",
    };
  }
}
