import type { NativeReviewStatus } from "@backline/types";
import { useCallback, useEffect, useRef, useState } from "react";

import { extensionRequest, isExtensionContextInvalidated, reviewExtensionProblem } from "./review-extension";

export function ExtensionReadiness() {
  const active = useRef<AbortController | null>(null);
  const [phase, setPhase] = useState<"checking" | "ready" | "setup" | "reload">("checking");
  const [message, setMessage] = useState("");
  const check = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setPhase("checking");
    try {
      const status = await extensionRequest<NativeReviewStatus>("status", undefined, controller.signal);
      if (controller.signal.aborted) return;
      const problem = reviewExtensionProblem(status);
      setPhase(problem ? "setup" : "ready");
      setMessage(problem ?? `Extension ${status.extensionVersion} is ready in this browser. Open a project to start website review.`);
    } catch (error) {
      if (controller.signal.aborted) return;
      const reload = isExtensionContextInvalidated(error);
      setPhase(reload ? "reload" : "setup");
      setMessage(reload ? "Your extension was updated. Reload this Backline tab to reconnect."
        : error instanceof Error ? error.message : "Install the extension, then check again.");
    } finally {
      if (active.current === controller) active.current = null;
    }
  }, []);
  useEffect(() => {
    void check();
    return () => { active.current?.abort(); };
  }, [check]);
  return <div className="bl-extension-check">
    <p role="status" aria-live="polite">{phase === "checking" ? "Checking the extension in this browser…" : message}</p>
    <button type="button" className="bl-quiet" disabled={phase === "checking"} onClick={() => void check()}>
      {phase === "checking" ? "Checking…" : "Check again"}
    </button>
    {phase === "setup" && <button type="button" className="bl-quiet" onClick={() => window.location.reload()}>Installed? Reload this tab</button>}
    {phase === "reload" && <button type="button" className="bl-button" onClick={() => window.location.reload()}>Reload Backline</button>}
  </div>;
}
