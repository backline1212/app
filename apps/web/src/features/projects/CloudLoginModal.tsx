import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import type { Schemas } from "@backline/types";
import { Dialog } from "../../components/Dialog";
import { apiFetch } from "../../lib/api-client";

type CloudLoginSessionOut = Schemas["CloudLoginSessionOut"];

type Phase = "starting" | "connecting" | "live" | "capturing" | "done" | "error" | "busy";

const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 800;

// Special keys the hidden capture input's own onInput can't produce (it only ever fires
// for characters actually inserted into the field) - forwarded by name to
// page.keyboard.press on the server (cloud_login_app.py's _handle_input).
const FORWARDED_KEYS = new Set([
  "Enter",
  "Backspace",
  "Delete",
  "Tab",
  "Escape",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

export function CloudLoginModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>("starting");
  const [status, setStatus] = useState("Starting a private browser...");
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keyCaptureRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const frameImageRef = useRef(new Image());

  useEffect(() => {
    let cancelled = false;
    let tickTimer: number | undefined;

    async function start() {
      let session: CloudLoginSessionOut;
      try {
        session = await apiFetch<CloudLoginSessionOut>(
          `/api/v1/projects/${projectId}/cloud-login/sessions`,
          { method: "POST" },
        );
      } catch (err) {
        if (!cancelled) {
          setPhase("error");
          setStatus(err instanceof Error ? err.message : "Could not start a live browser.");
        }
        return;
      }
      if (cancelled) return;

      setPhase("connecting");
      const ws = new WebSocket(session.ws_url);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data as string) as Record<string, unknown>;
        if (message.type === "frame" && typeof message.data === "string") {
          const image = frameImageRef.current;
          image.onload = () => {
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext("2d");
            if (canvas && ctx) ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          };
          image.src = `data:image/jpeg;base64,${message.data}`;
        } else if (message.type === "ready") {
          setPhase("live");
          const deadline = Date.now() + session.session_ttl_seconds * 1000;
          setSecondsLeft(session.session_ttl_seconds);
          tickTimer = window.setInterval(() => {
            setSecondsLeft(Math.max(0, Math.round((deadline - Date.now()) / 1000)));
          }, 1000);
          keyCaptureRef.current?.focus();
        } else if (message.type === "status" && typeof message.message === "string") {
          setStatus(message.message);
        } else if (message.type === "error") {
          setPhase(message.code === "BUSY" ? "busy" : "error");
          setStatus(typeof message.message === "string" ? message.message : "Something went wrong.");
        } else if (message.type === "done" && typeof message.redeem_url === "string") {
          setPhase("done");
          applySyncedSession(message.redeem_url);
        }
      };
      ws.onerror = () => {
        if (!cancelled) {
          setPhase("error");
          setStatus("Lost the connection to the live browser.");
        }
      };
    }

    void start();
    return () => {
      cancelled = true;
      wsRef.current?.close();
      if (tickTimer) window.clearInterval(tickTimer);
    };
  }, [projectId]);

  function applySyncedSession(redeemUrl: string) {
    // Same technique the extension uses (docs/tdr/0041) - a hidden iframe navigating to
    // the redeem URL applies its Set-Cookie response and runs its localStorage-writing
    // script on the preview origin itself. The canvas iframe, being that same origin,
    // picks both up the next time it loads.
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = redeemUrl;
    document.body.appendChild(iframe);
    window.setTimeout(() => iframe.remove(), 2000);
  }

  function send(message: Record<string, unknown>) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }

  function toViewportPoint(event: ReactMouseEvent<HTMLCanvasElement>): { x: number; y: number } {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * VIEWPORT_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * VIEWPORT_HEIGHT,
    };
  }

  function handleFinish() {
    setPhase("capturing");
    setStatus("Capturing your session...");
    send({ type: "finish" });
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (!FORWARDED_KEYS.has(event.key)) return;
    send({ type: "key", key: event.key });
    if (event.key !== "Tab") event.preventDefault();
  }

  const showCanvas = phase === "connecting" || phase === "live" || phase === "capturing";

  return (
    <Dialog title="Sign in with a live browser" onClose={onClose}>
      <div className="bl-cloud-login">
        {phase === "live" && secondsLeft !== null && (
          <p className="bl-cloud-login-timer">
            {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")} left
          </p>
        )}
        {(phase === "starting" || phase === "connecting" || phase === "capturing") && <p>{status}</p>}
        {(phase === "busy" || phase === "error") && <p className="bl-error">{status}</p>}
        {phase === "done" && <p>Synced. Reload the canvas in the dashboard to see it.</p>}

        {showCanvas && (
          <>
            <canvas
              ref={canvasRef}
              width={VIEWPORT_WIDTH}
              height={VIEWPORT_HEIGHT}
              className="bl-cloud-login-canvas"
              onMouseMove={(e) => send({ type: "mouse", event: "move", ...toViewportPoint(e) })}
              onMouseDown={(e) => {
                keyCaptureRef.current?.focus();
                send({ type: "mouse", event: "down", ...toViewportPoint(e) });
              }}
              onMouseUp={(e) => send({ type: "mouse", event: "up", ...toViewportPoint(e) })}
              onWheel={(e) => send({ type: "wheel", deltaX: e.deltaX, deltaY: e.deltaY })}
              onContextMenu={(e) => e.preventDefault()}
            />
            <input
              ref={keyCaptureRef}
              className="bl-cloud-login-keys"
              aria-hidden="true"
              tabIndex={-1}
              autoComplete="off"
              onInput={(e) => {
                const value = e.currentTarget.value;
                if (value) send({ type: "text", text: value });
                e.currentTarget.value = "";
              }}
              onKeyDown={handleKeyDown}
            />
          </>
        )}

        <div className="bl-cloud-login-actions">
          {phase === "live" && (
            <button type="button" className="bl-button" onClick={handleFinish}>
              Done - use this session
            </button>
          )}
          {(phase === "done" || phase === "error" || phase === "busy") && (
            <button type="button" className="bl-button" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
