import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import type { ProjectOut } from "../api";
import { AiTab } from "./AiTab";
import { CommentsTab } from "./CommentsTab";
import { DetailsTab } from "./DetailsTab";
import {
  CommentsIcon,
  DetailsIcon,
  IntegrationsIcon,
  McpIcon,
  SparkleIcon,
} from "./icons";
import { IntegrationsTab } from "./IntegrationsTab";
import { McpTab } from "./McpTab";

type TabId = "details" | "comments" | "mcp" | "integrations" | "ai";

const TABS: { id: TabId; label: string; icon: typeof DetailsIcon }[] = [
  { id: "details", label: "Details", icon: DetailsIcon },
  { id: "comments", label: "Comments", icon: CommentsIcon },
  { id: "mcp", label: "MCP", icon: McpIcon },
  { id: "integrations", label: "Integrations", icon: IntegrationsIcon },
];

const TAB_TITLES: Record<TabId, string> = {
  details: "About this page",
  comments: "Comments",
  mcp: "MCP Server",
  integrations: "Integrations",
  ai: "BugHunt AI",
};

interface ProjectSidePanelProps {
  project: ProjectOut;
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  /** The page selected in the canvas. */
  currentPageId: string | null;
  selectedCommentId?: string | null;
  /** Selects a comment and takes the canvas to its pin (ProjectOverviewPage). */
  onRevealComment?: (commentId: string) => void;
  /** Set each time a pin is clicked in the canvas - brings up the Comments tab on that
   * comment's detail. */
  openCommentRequest?: { commentId: string; nonce: number } | null;
}

// Escape closes the drawer - except while it's being used for something Escape already
// means something else to: a field with text in it (which the drawer closing would
// throw away), a menu or date picker that handled the key itself, or a dialog on top.
function escapeClosesDrawer(event: KeyboardEvent): boolean {
  if (event.key !== "Escape" || event.defaultPrevented) return false;
  const target = event.target as HTMLElement | null;
  if (!target) return true;
  if (target.closest("dialog, [role='dialog'], .bl-dp, .bl-comment-popover")) return false;
  if (target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && target.type !== "checkbox")) {
    return target.value.trim() === "";
  }
  return !target.isContentEditable;
}

// Collapsed by default (just the icon rail) - clicking a tab opens its panel; clicking
// the already-open tab again, or its own close button, collapses it back. Only one tab
// panel is ever open at a time, matching the reference this was modeled on.
export function ProjectSidePanel({
  project,
  workspaceId,
  workspaceSlug,
  workspaceName,
  currentPageId,
  selectedCommentId,
  onRevealComment,
  openCommentRequest,
}: ProjectSidePanelProps) {
  // A shared `?thread=<id>` link (Comments tab's own URL-owned state, see
  // useCommentFilters.ts) must reopen this drawer on a fresh load - otherwise the id
  // survives in the URL but CommentsTab never mounts to read it, and the deep link
  // silently does nothing. Only checked once, at mount: after that, opening/closing
  // the drawer is the user's own choice and shouldn't be fought on every re-render.
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId | null>(() =>
    searchParams.get("thread") ? "comments" : null,
  );

  // BugHunt AI's "view" on a finding opens that comment's detail the same way a pin
  // click does; whichever asked last wins.
  const [aiOpenRequest, setAiOpenRequest] = useState<{ commentId: string; nonce: number } | null>(null);
  // A request is acted on once: reopening the Comments tab later mustn't jump back to
  // the comment some earlier pin click asked for.
  const [handledNonce, setHandledNonce] = useState(0);
  const newestRequest =
    aiOpenRequest && (!openCommentRequest || aiOpenRequest.nonce > openCommentRequest.nonce)
      ? aiOpenRequest
      : openCommentRequest ?? null;
  const latestOpenRequest = newestRequest && newestRequest.nonce > handledNonce ? newestRequest : null;

  // Whatever tab (if any) was open before, a pin click brings up Comments.
  useEffect(() => {
    if (openCommentRequest) setActiveTab("comments");
  }, [openCommentRequest]);

  function toggleTab(id: TabId) {
    setActiveTab((current) => (current === id ? null : id));
  }

  useEffect(() => {
    if (!activeTab) return;
    function onKeyDown(event: KeyboardEvent) {
      if (escapeClosesDrawer(event)) setActiveTab(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeTab]);

  return (
    <div className="bl-review-sidepanel">
      {activeTab && (
        <div className="bl-review-drawer" role="complementary" aria-label={TAB_TITLES[activeTab]}>
          <div className="bl-review-drawer-head">
            <h2 className="text-sm font-semibold">{TAB_TITLES[activeTab]}</h2>
            <button
              onClick={() => setActiveTab(null)}
              aria-label="Close panel"
              className="bl-review-drawer-close"
            >
              ×
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {activeTab === "details" && (
              <DetailsTab
                project={project}
                workspaceId={workspaceId}
                workspaceSlug={workspaceSlug}
                workspaceName={workspaceName}
              />
            )}
            {activeTab === "comments" && (
              <CommentsTab
                projectId={project.id}
                workspaceId={workspaceId}
                currentPageId={currentPageId}
                selectedCommentId={selectedCommentId}
                onRevealComment={onRevealComment}
                openCommentRequest={latestOpenRequest}
                onOpenRequestHandled={setHandledNonce}
              />
            )}
            {activeTab === "mcp" && (
              <McpTab workspaceId={workspaceId} workspaceSlug={workspaceSlug} />
            )}
            {activeTab === "integrations" && (
              <IntegrationsTab
                project={project}
                workspaceId={workspaceId}
                workspaceSlug={workspaceSlug}
              />
            )}
            {activeTab === "ai" && (
              <AiTab
                workspaceId={workspaceId}
                projectId={project.id}
                onViewComment={(commentId) => {
                  onRevealComment?.(commentId);
                  setAiOpenRequest({ commentId, nonce: Date.now() });
                  setActiveTab("comments");
                }}
              />
            )}
          </div>
        </div>
      )}

      <nav className="bl-review-panel-rail" aria-label="Project panel">
        {TABS.map(({ id, label, icon: TabIcon }) => (
          <button
            key={id}
            onClick={() => toggleTab(id)}
            aria-pressed={activeTab === id}
            aria-label={label}
            className={`bl-review-panel-tab ${activeTab === id ? "is-active" : ""}`}
          >
            <TabIcon />
            <span>{label}</span>
          </button>
        ))}

        <button
          onClick={() => toggleTab("ai")}
          aria-pressed={activeTab === "ai"}
          aria-label="BugHunt AI"
          className={`bl-review-panel-tab bl-review-ai-tab ${activeTab === "ai" ? "is-active" : ""}`}
        >
          <span className="bl-review-ai-mark">
            <SparkleIcon width={13} height={13} stroke="none" fill="currentColor" />
          </span>
          <span>BugHunt AI</span>
        </button>
      </nav>
    </div>
  );
}
