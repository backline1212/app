import { useState } from "react";
import { Link } from "react-router-dom";

import type { ProjectOut } from "../api";
import {
  CheckCircleIcon,
  LandscapeIcon,
  LockIcon,
  PortraitIcon,
  RocketIcon,
  ShareIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "../panel/icons";
import { CollaboratorsModal } from "../panel/CollaboratorsModal";
import { ViewportMenu, type ViewportOption } from "./ViewportMenu";
import { BrowserMenu, type BrowserOption } from "./BrowserMenu";
import { VersionMenu } from "./VersionMenu";

export type CanvasMode = "browse" | "comment" | "draw";

interface ProjectFooterProps {
  project: ProjectOut;
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  totalComments: number;
  commentsUnavailable?: boolean;
  currentPageId: string | null;
  onSelectPage: (pageId: string) => void;
  viewport: ViewportOption | null;
  onViewportChange: (viewport: ViewportOption | null) => void;
  /** Width the responsive frame was dragged to, or null while it fills the canvas. */
  fitWidth?: number | null;
  browser: BrowserOption;
  onBrowserChange: (browser: BrowserOption) => void;
  orientation: "portrait" | "landscape";
  onOrientationChange: (orientation: "portrait" | "landscape") => void;
  zoomScale: number;
  onZoomChange: (scale: number) => void;
  iframeStatus: "loading" | "loaded" | "error" | "unavailable";
}

export function ProjectFooter({
  project,
  workspaceId,
  workspaceSlug,
  workspaceName,
  totalComments,
  commentsUnavailable = false,
  currentPageId,
  onSelectPage,
  viewport,
  onViewportChange,
  fitWidth = null,
  browser,
  onBrowserChange,
  orientation,
  onOrientationChange,
  zoomScale,
  onZoomChange,
  iframeStatus,
}: ProjectFooterProps) {
  const [showCollaborators, setShowCollaborators] = useState(false);
  const width = viewport
    ? orientation === "portrait"
      ? viewport.width
      : viewport.height
    : null;
  const height = viewport
    ? orientation === "portrait"
      ? viewport.height
      : viewport.width
    : null;
  const statusLabel = iframeStatus === "loaded"
    ? "Proxy connected"
    : iframeStatus === "loading"
      ? "Connecting proxy"
      : iframeStatus === "error"
        ? "Preview unavailable"
        : "No review link";

  return (
    <footer className="bl-review-statusbar" aria-label="Canvas status and viewport controls">
      <div className="bl-review-status-controls">
        <ViewportMenu viewport={viewport} onChange={onViewportChange} />
        <div className="bl-review-segment" aria-label="Viewport orientation">
          <button
            type="button"
            aria-pressed={orientation === "portrait"}
            aria-label="Portrait orientation"
            disabled={!viewport}
            onClick={() => onOrientationChange("portrait")}
          >
            <PortraitIcon width={13} height={13} />
          </button>
          <button
            type="button"
            aria-pressed={orientation === "landscape"}
            aria-label="Landscape orientation"
            disabled={!viewport}
            onClick={() => onOrientationChange("landscape")}
          >
            <LandscapeIcon width={13} height={13} />
          </button>
        </div>
        <div className="bl-review-zoom" aria-label="Canvas zoom">
          <button
            type="button"
            aria-label="Zoom out"
            disabled={zoomScale <= 0.5}
            onClick={() => onZoomChange(Math.max(0.5, zoomScale - 0.1))}
          >
            <ZoomOutIcon width={13} height={13} />
          </button>
          <button
            type="button"
            className="bl-review-zoom-value"
            aria-label="Reset zoom to 100 percent"
            onClick={() => onZoomChange(1)}
          >
            {Math.round(zoomScale * 100)}%
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            disabled={zoomScale >= 1.5}
            onClick={() => onZoomChange(Math.min(1.5, zoomScale + 0.1))}
          >
            <ZoomInIcon width={13} height={13} />
          </button>
        </div>
      </div>

      <div className="bl-review-source-status" role="status" aria-live="polite">
        <span className={`bl-review-source-dot is-${iframeStatus}`} aria-hidden="true" />
        <span>{statusLabel}</span>
        <span aria-hidden="true">·</span>
        <span>
          {width && height
            ? `${width} × ${height}`
            : fitWidth
              ? `${fitWidth} × auto`
              : "Fit canvas"}
        </span>
        <span aria-hidden="true">·</span>
        <BrowserMenu browser={browser} onChange={onBrowserChange} />
      </div>

      <div className="bl-review-status-actions">
        <span className="bl-review-comment-count">
          {commentsUnavailable ? "Comments unavailable" : `${totalComments} comment${totalComments === 1 ? "" : "s"}`}
        </span>
        <VersionMenu projectId={project.id} currentPageId={currentPageId} onSelectPage={onSelectPage} />
        <button type="button" className="bl-review-control" onClick={() => setShowCollaborators(true)}>
          <ShareIcon width={13} height={13} />
          <span>Access</span>
        </button>
        <button
          type="button"
          className="bl-review-control bl-review-coming-soon"
          disabled
          title="Deploy-triggered capture is coming soon"
        >
          <RocketIcon width={13} height={13} />
          <span>Deploy sync</span>
          <em>Coming soon</em>
        </button>
        <button type="button" className="bl-review-control bl-review-optional-control" disabled title="Page approval is coming soon">
          <CheckCircleIcon width={13} height={13} />
          <span>Approve</span>
          <em>Coming soon</em>
        </button>
        <button type="button" className="bl-review-control bl-review-optional-control" disabled title="Private comment mode is coming soon">
          <LockIcon width={13} height={13} />
          <span>Private</span>
          <em>Coming soon</em>
        </button>
        <Link className="bl-review-control bl-review-optional-control" to={`/w/${workspaceSlug}/billing`}>
          Plans
        </Link>
      </div>
      {showCollaborators && (
        <CollaboratorsModal
          project={project}
          workspaceId={workspaceId}
          workspaceSlug={workspaceSlug}
          workspaceName={workspaceName}
          onClose={() => setShowCollaborators(false)}
        />
      )}
    </footer>
  );
}
