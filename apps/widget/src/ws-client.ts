// Minimal reconnecting WebSocket client for the widget's own realtime signal:
// presence (announced by connecting with `page_id`) and status updates on comments this
// guest created (12-API-WebSocket.md §12.6). Deliberately not shared code with the
// dashboard's apps/web/src/lib/ws-client.ts - the widget is a separate <40KB vanilla-JS
// bundle (07-Review-SDK.md), so the same backoff schedule (1s, 2s, 4s... capped at 30s,
// §7.5) is duplicated here rather than factored into a package neither target needs
// elsewhere.
export function connectReviewSocket(
  apiBaseUrl: string,
  guestToken: string,
  pageId: string,
  onEvent: (type: string, payload: any) => void, // eslint-disable-line @typescript-eslint/no-explicit-any
  onStatusChange?: (status: "connected" | "connecting" | "offline" | "authorization-lost") => void,
): () => void {
  const wsBaseUrl = apiBaseUrl.replace(/^http/, "ws");
  let socket: WebSocket | null = null;
  let attempt = 0;
  let closedByCaller = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function open(): void {
    // UI expiry detection only; the server remains the authority for the signature
    // and live policy. It also prevents retrying an expired handshake forever.
    try {
      const encoded = guestToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const claims = JSON.parse(atob(encoded.padEnd(encoded.length + ((4 - encoded.length % 4) % 4), "="))) as { exp?: unknown };
      if (typeof claims.exp !== "number" || !Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now()) throw new Error("Expired");
    } catch {
      closedByCaller = true;
      onStatusChange?.("authorization-lost");
      return;
    }
    const url = `${wsBaseUrl}/ws?token=${encodeURIComponent(guestToken)}&page_id=${encodeURIComponent(pageId)}`;
    socket = new WebSocket(url);

    socket.onopen = () => {
      attempt = 0;
      onStatusChange?.("connected");
    };

    socket.onmessage = (event: MessageEvent<string>) => {
      try {
        const envelope = JSON.parse(event.data);
        onEvent(envelope.type, envelope.payload);
      } catch {
        // Malformed frame - nothing to recover, just drop it.
      }
    };

    socket.onclose = (event) => {
      if (closedByCaller) return;
      if (event.code === 4401 || event.code === 4403) {
        closedByCaller = true;
        onStatusChange?.("authorization-lost");
        return;
      }
      onStatusChange?.(navigator.onLine ? "connecting" : "offline");

      const delay = Math.min(1000 * 2 ** attempt, 30_000);
      attempt += 1;
      reconnectTimer = setTimeout(open, delay);
    };

    socket.onerror = () => socket?.close();
  }

  open();

  return () => {
    closedByCaller = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    socket?.close();
  };
}
