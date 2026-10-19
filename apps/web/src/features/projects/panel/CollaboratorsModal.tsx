import { ShareProjectModal } from "../../workspaces/ShareProjectModal";
import type { ProjectOut } from "../api";

interface CollaboratorsModalProps {
  project: ProjectOut;
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  onClose: () => void;
}

// Footer Access and the project Share action use the same role, link-expiry and
// recovery flow. The old separate toggle revoked only one link while claiming
// project-wide access was off, and its copy action could offer expired links.
export function CollaboratorsModal(props: CollaboratorsModalProps) {
  return <ShareProjectModal {...props} />;
}
