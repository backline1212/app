import { useQuery } from "@tanstack/react-query";

import { qk } from "../../lib/query-keys";
import { getProject } from "./api";

// The canvas, board and share-links routes all read the same project. One definition
// keeps them on one cache entry, so moving between them shows the name at once
// instead of refetching it per page.
export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: qk.project(projectId ?? ""),
    queryFn: () => getProject(projectId!),
    enabled: !!projectId,
  });
}
