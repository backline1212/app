import { refreshSession } from "./api-client";
import { getAccessToken } from "./auth-token";
import { decodeAccessToken } from "./jwt";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const WS_BASE_URL = API_BASE_URL.replace(/^http/, "ws");

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

interface EventEnvelope {
  type: string;
  workspace_id: string;
  payload: unknown;
  ts: string;
}

type EventHandler = (payload: any, envelope: EventEnvelope) => void; // eslint-disable-line @typescript-eslint/no-explicit-any

// Single connection per active workspace (12-API-WebSocket.md §12.6), reconnecting with
// the exact backoff schedule 07-Review-SDK.md §7.5 specifies for the widget's own
// WebSocket client: 1s, 2s, 4s... capped at 30s. The two clients can't share code (the
// widget is a separate <40KB vanilla-JS bundle, apps/widget/src/ws-client.ts), so the
// schedule is duplicated deliberately rather than factored into a shared package neither
// build target actually needs elsewhere.
export class WsClient {
  private socket: WebSocket | null = null;
  private handlers = new Map<string, Set<EventHandler>>();
  private statusListeners = new Set<(status: ConnectionStatus) => void>();
  private attempt = 0;
  private closedByCaller = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private refreshBeforeReconnect = false;
  status: ConnectionStatus = "disconnected";

  // Public and mutable rather than constructor-injected: the dashboard's WSProvider
  // creates one WsClient for the app's lifetime but only learns the active workspace_id
  // (and therefore the connect URL) after the auth/workspace context resolves.
  urlFactory: () => string | null;
  onAuthorizationLost: () => void = () => undefined;

  constructor(urlFactory: () => string | null = () => null) {
    this.urlFactory = urlFactory;
  }

  connect(): void {
    this.disconnect();
    this.closedByCaller = false;
    this.attempt = 0;
    void this.open();
  }

  disconnect(): void {
    this.closedByCaller = true;
    this.generation += 1;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
    this.setStatus("disconnected");
  }

  on(type: string, handler: EventHandler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  onStatusChange(listener: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private scheduleReconnect(): void {
    if (this.closedByCaller) return;
    const delay = Math.min(1000 * 2 ** this.attempt, 30_000);
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => void this.open(), delay);
  }

  private async open(): Promise<void> {
    const generation = this.generation;
    const token = getAccessToken();
    const claims = decodeAccessToken(token ?? "");
    if (token && (this.refreshBeforeReconnect || (claims && claims.exp * 1000 <= Date.now()))) {
      try {
        await refreshSession();
        this.refreshBeforeReconnect = false;
      } catch {
        if (generation === this.generation) this.scheduleReconnect();
        return;
      }
    }
    if (this.closedByCaller || generation !== this.generation) return;
    const url = this.urlFactory();
    if (!url) {
      this.setStatus("disconnected");
      return;
    }
    this.setStatus(this.attempt === 0 ? "connecting" : "reconnecting");

    const socket = new WebSocket(url);
    this.socket = socket;

    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.attempt = 0;
      this.setStatus("connected");
    };

    socket.onmessage = (event: MessageEvent<string>) => {
      if (this.socket !== socket) return;
      let envelope: EventEnvelope;
      try {
        envelope = JSON.parse(event.data);
      } catch {
        return;
      }
      this.handlers.get(envelope.type)?.forEach((handler) => handler(envelope.payload, envelope));
    };

    socket.onclose = (event) => {
      if (this.socket !== socket) return;
      this.setStatus("disconnected");
      if (this.closedByCaller) return;
      if (event.code === 4401 || event.code === 4403) {
        this.refreshBeforeReconnect = true;
        this.onAuthorizationLost();
      }
      this.scheduleReconnect();
    };

    socket.onerror = () => socket.close();
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.statusListeners.forEach((listener) => listener(status));
  }
}

export function buildWorkspaceSocketUrl(workspaceId: string): string | null {
  const token = getAccessToken();
  if (!token) return null;
  return `${WS_BASE_URL}/ws?token=${encodeURIComponent(token)}&workspace_id=${encodeURIComponent(workspaceId)}`;
}
