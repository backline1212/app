import type { ConnectionResponse, ExtensionMessage } from "./lib/messages";
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

  return false;
});
