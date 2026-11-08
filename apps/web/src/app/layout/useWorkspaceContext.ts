import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { useAuth } from "../../features/auth/AuthContext";
import * as workspacesApi from "../../features/workspaces/api";
import type { WorkspaceOut } from "../../features/workspaces/api";
import { qk } from "../../lib/query-keys";

// The workspace used last on this browser; sign-in drops you straight back into it.
export const LAST_WORKSPACE_KEY = "backline:last-workspace";

// Where to send someone whose workspace link they can't open.
export const NO_WORKSPACE_ACCESS = { notice: "You don't have access to that workspace. It may have been deleted, or you were removed from it." };

type WorkspaceContextResult =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "error"; message: string }
  | { status: "switching"; workspace: WorkspaceOut }
  | { status: "ready"; workspace: WorkspaceOut };

// Shared by every layout that resolves :workspaceSlug into a workspace context and
// switches the active access token into that workspace (13-Authentication.md §13.3)
// before rendering children - both DashboardLayout (sidebar) and ProjectLayout (no
// sidebar) need this exact same resolution, just with different chrome around it.
export function useWorkspaceContext(): WorkspaceContextResult {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { workspaceId: activeWorkspaceId, switchWorkspace } = useAuth();
  const [switchError, setSwitchError] = useState<string | null>(null);
  const attempted = useRef<string | null>(null);

  const { data: workspaces, isLoading, error } = useQuery({
    queryKey: qk.workspaces(),
    queryFn: workspacesApi.listWorkspaces,
  });

  const targetWorkspace = workspaces?.find((w) => w.slug === workspaceSlug);
  const needsSwitch = targetWorkspace && targetWorkspace.id !== activeWorkspaceId;

  useEffect(() => {
    if (!needsSwitch) {
      attempted.current = null;
      setSwitchError(null);
      return;
    }
    if (!targetWorkspace || !needsSwitch || attempted.current === targetWorkspace.id) return;
    attempted.current = targetWorkspace.id;
    setSwitchError(null);
    switchWorkspace(targetWorkspace.id).catch((err: unknown) => {
      setSwitchError(err instanceof Error ? err.message : "Could not open this workspace.");
    });
  }, [targetWorkspace, needsSwitch, switchWorkspace]);

  // Remember the workspace however you got here (sidebar switcher, a link, the picker).
  const readyId = targetWorkspace && !needsSwitch ? targetWorkspace.id : null;
  useEffect(() => {
    if (!readyId) return;
    try { localStorage.setItem(LAST_WORKSPACE_KEY, readyId); } catch { /* storage may be blocked */ }
  }, [readyId]);

  if (isLoading) return { status: "loading" };
  if (error) return { status: "error", message: error.message };
  if (!targetWorkspace) return { status: "not-found" };
  if (switchError && needsSwitch) return { status: "error", message: switchError };
  if (needsSwitch) return { status: "switching", workspace: targetWorkspace };
  return { status: "ready", workspace: targetWorkspace };
}
