// Runs in the reviewed page's own JavaScript world (chrome.scripting world "MAIN"),
// injected only while a Backline browser review is active in this tab. It reuses the
// widget's console/network failure hooks and relays each entry to the extension's
// content script, which keeps them for "Attach console & network errors". Nothing is
// sent to Backline unless the reviewer posts a comment with that box ticked.
import { installDiagnosticsCapture } from "../../widget/src/diagnostics";

const marker = window as Window & { __backlineDiagnostics?: boolean };
if (!marker.__backlineDiagnostics) {
  marker.__backlineDiagnostics = true;
  installDiagnosticsCapture({
    emit: (entry) => window.postMessage({ __backlineDiagnostic: true, entry }, location.origin),
  });
}
