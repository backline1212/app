import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useRef } from "react";
import type { ReactNode } from "react";

import { useAuth } from "../features/auth/AuthContext";
import { buildWorkspaceSocketUrl, WsClient } from "../lib/ws-client";
import { useConnectionStore } from "../stores/connectionStore";

interface WSContextValue {
  client: WsClient;
}

const WSContext = createContext<WSContextValue | null>(null);

// Owns the single WebSocket connection for the active workspace (05-Frontend-Architecture.md
// §5.4). Lives inside AuthProvider (needs workspaceId) but outside individual routes, so
// the connection survives navigation between board/pages within the same workspace.
export function WSProvider({ children }: { children: ReactNode }) {
  const cache = useQueryClient();
  const { workspaceId } = useAuth();
  const setStatus = useConnectionStore((state) => state.setStatus);
  const clientRef = useRef<WsClient>();
  if (!clientRef.current) {
    clientRef.current = new WsClient();
  }
  const client = clientRef.current;

  useEffect(() => client.onStatusChange(setStatus), [client, setStatus]);
  useEffect(() => {
    client.onAuthorizationLost = () => { void cache.resetQueries(); };
    return () => { client.onAuthorizationLost = () => undefined; };
  }, [client, cache]);

  useEffect(() => {
    if (!workspaceId) {
      client.disconnect();
      return;
    }
    client.urlFactory = () => buildWorkspaceSocketUrl(workspaceId);
    client.connect();
    return () => client.disconnect();
  }, [client, workspaceId]);

  return <WSContext.Provider value={{ client }}>{children}</WSContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components, @typescript-eslint/no-explicit-any
export function useWSEvent(type: string, handler: (payload: any, envelope: any) => void): void {
  const ctx = useContext(WSContext);
  if (!ctx) throw new Error("useWSEvent must be used within WSProvider");
  useEffect(() => ctx.client.on(type, handler), [ctx.client, type, handler]);
}
