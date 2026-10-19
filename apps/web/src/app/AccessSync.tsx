import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { useWSEvent } from "./WSProvider";

// TDR-0056: someone's access to a project, or the member list itself, changed. Both
// events carry ids only. Reset protected data before refetch: invalidation alone
// retains old private data when the next fetch correctly returns 403/404. Keys such
// as comments, assets and notifications aren't all nested under a project key.
export function AccessSync() {
  const cache = useQueryClient();

  const resetAccess = useCallback(() => {
    void cache.resetQueries();
  }, [cache]);

  useWSEvent("project.access_changed", resetAccess);
  useWSEvent("workspace.members_changed", resetAccess);
  return null;
}
