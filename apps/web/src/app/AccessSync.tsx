import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { qk } from "../lib/query-keys";
import { useWSEvent } from "./WSProvider";

// TDR-0056: someone's access to a project, or the member list itself, changed. Both
// events carry ids only, so the cached data they affect is refetched rather than
// patched: project lists and counts (a project may have appeared or gone), the open
// project's own record (its role and access), and the Members page's views. Rendered
// by both workspace layouts so a project page notices too.
export function AccessSync({ workspaceId }: { workspaceId: string }) {
  const cache = useQueryClient();

  const onProjectAccess = useCallback(
    (payload: { project_id?: string }) => {
      void cache.invalidateQueries({ queryKey: qk.projects(workspaceId) });
      void cache.invalidateQueries({ queryKey: qk.dashboard(workspaceId) });
      void cache.invalidateQueries({ queryKey: qk.tickets(workspaceId) });
      void cache.invalidateQueries({ queryKey: qk.activity(workspaceId) });
      void cache.invalidateQueries({ queryKey: qk.accessMatrix(workspaceId) });
      void cache.invalidateQueries({ queryKey: qk.clients(workspaceId) });
      if (payload?.project_id) {
        void cache.invalidateQueries({ queryKey: qk.project(payload.project_id) });
      }
    },
    [cache, workspaceId],
  );

  const onMembers = useCallback(() => {
    void cache.invalidateQueries({ queryKey: qk.members(workspaceId) });
    void cache.invalidateQueries({ queryKey: qk.accessMatrix(workspaceId) });
    void cache.invalidateQueries({ queryKey: qk.joinRequests(workspaceId) });
  }, [cache, workspaceId]);

  useWSEvent("project.access_changed", onProjectAccess);
  useWSEvent("workspace.members_changed", onMembers);
  return null;
}
