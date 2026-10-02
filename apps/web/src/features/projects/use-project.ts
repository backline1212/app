import { useQuery } from "@tanstack/react-query";

import { projectCan } from "../../lib/project-roles";
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

/**
 * The signed-in person's role on a project (TDR-0056) and what it allows, read from
 * the same cached project. Controls a role can't use are hidden or disabled with it;
 * the API enforces the same matrix regardless.
 */
export function useProjectRole(projectId: string | undefined) {
  const { data: project } = useProject(projectId);
  return {
    role: project?.my_role ?? null,
    canComment: projectCan(project, "comment"),
    canEdit: projectCan(project, "edit"),
    canManage: projectCan(project, "manage"),
    loaded: project !== undefined,
  };
}
