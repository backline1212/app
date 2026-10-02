import { Link, Navigate, Outlet } from "react-router-dom";

import { LoadingScreen } from "../../components/LoadingScreen";
import { AccessSync } from "../AccessSync";
import { useWorkspaceContext } from "./useWorkspaceContext";

// Project routes intentionally leave the workspace sidebar behind. The website canvas
// needs the full viewport, while board and share-link children retain their own route
// chrome and the same resolved, authorization-scoped workspace context.
export function ProjectLayout() {
  const result = useWorkspaceContext();

  if (result.status === "loading") {
    return <LoadingScreen />;
  }
  if (result.status === "not-found") {
    return <Navigate to="/" replace />;
  }
  if (result.status === "error") {
    return (
      <main className="bl-review-gate">
        <span className="bl-loading-mark" aria-hidden="true">B</span>
        <div className="bl-review-gate-copy">
          <span className="bl-review-eyebrow">Workspace access</span>
          <h1>Couldn’t open this workspace</h1>
          <p>{result.message}</p>
          <Link className="bl-quiet" to="/">Choose another workspace</Link>
        </div>
      </main>
    );
  }
  if (result.status === "switching") {
    return <LoadingScreen label={`Opening ${result.workspace.name}`} />;
  }

  return (
    <div className="bl-project-route">
      <AccessSync workspaceId={result.workspace.id} />
      <Outlet context={{ workspace: result.workspace }} />
    </div>
  );
}
