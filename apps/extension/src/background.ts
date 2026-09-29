import type {
  ConnectionResponse,
  ExtensionMessage,
} from "./lib/messages";
import { clearConnection, getConnection, setConnection } from "./lib/storage";
import { clearNativeReviews, registerNativeReview } from "./native-review";

registerNativeReview();

// Popup connection messages. Native browser reviews validate the member token
// against the API before updating the same extension-only connection store.
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
    Promise.all([clearConnection(), clearNativeReviews()]).then(() =>
      sendResponse({ connection: null } satisfies ConnectionResponse),
    );
    return true;
  }

  return false;
});
