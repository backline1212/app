import type { Schemas } from "@backline/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type CSSProperties, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useOutletContext, useParams, useSearchParams } from "react-router-dom";

import { useWSEvent } from "../../app/WSProvider";
import { API_BASE_URL, apiFetch } from "../../lib/api-client";
import { removeProjectComment, upsertProjectComment } from "../../lib/comment-cache";
import { qk } from "../../lib/query-keys";
import { WORKFLOW_STATUSES } from "../../lib/workflow";
import { AssetReview } from "../assets/AssetReview";
import { useAuth } from "../auth/AuthContext";
import * as boardApi from "../board/api";
import type { CommentOut, CommentStatus } from "../board/api";
import * as shareLinksApi from "../share-links/api";
import { ShareProjectModal } from "../workspaces/ShareProjectModal";
import type { WorkspaceOut } from "../workspaces/api";
import * as projectsApi from "./api";
import { ProjectFooter, type CanvasMode } from "./footer/ProjectFooter";
import { VIEWPORTS, type ViewportOption } from "./footer/ViewportMenu";
import { BROWSERS, type BrowserOption } from "./footer/BrowserMenu";
import { useBrowserRenderSnapshot } from "./render-api";
import {
  ArrowLeftIcon,
  CommentsIcon,
  ExternalLinkIcon,
  GlobeIcon,
  PointerIcon,
  ReloadIcon,
  ShareIcon,
} from "./panel/icons";
import { ProjectSidePanel } from "./panel/ProjectSidePanel";
import { CanvasResizer, type ResizePhase } from "./CanvasResizer";
import { ProjectForm } from "./ProjectForm";
import { ProjectMenu } from "./ProjectMenu";
import { ProjectPagesModal } from "./ProjectPagesModal";
import { ThemeToggle } from "../../components/ThemeToggle";
import { QuickToolsDock } from "./footer/QuickToolsDock";
import { loadShortcuts, ShortcutsModal } from "./ShortcutsModal";

type PageOut = Schemas["PageOut"];

// The canvas iframe is served from the API's own origin (its /proxy route), so
// messages sent into it are addressed there rather than to "*".
const CANVAS_ORIGIN = new URL(API_BASE_URL, window.location.origin).origin;

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.5;

// Playwright needs a concrete pixel size to launch a viewport with - unlike the live
// iframe, which can just fill whatever CSS gives it ("Fit canvas" / is-fit below), a
// render request always needs real numbers. Used only when the reviewer hasn't picked
// an explicit viewport from ViewportMenu.
const DEFAULT_RENDER_WIDTH = 1440;
const DEFAULT_RENDER_HEIGHT = 900;

// Matches backend/app/modules/browser_render/schemas.py's ENGINE_BY_BROWSER - shown so
// a reviewer knows "Safari" really means the WebKit engine, not a UA-spoofed Chromium.
const ENGINE_LABEL: Record<string, string> = {
  Chrome: "Chromium",
  Edge: "Chromium",
  Safari: "WebKit",
  Firefox: "Firefox",
};

function clampZoom(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 10) / 10));
}

function reviewUrl(token: string) {
  return `${window.location.origin}/review/${token}`;
}

function pageLabel(page: PageOut) {
  if (page.title) return page.title;
  try {
    return new URL(page.url_normalized).pathname || "/";
  } catch {
    return page.url_normalized;
  }
}

/** Normalizes a saved shortcut key ("Ctrl .", "ArrowRight", user-edited "CTRL C") and
 * a live KeyboardEvent to the same "ctrl+alt+shift+key" shape so they can be compared
 * case-insensitively - ShortcutsModal's own capture logic doesn't keep consistent
 * casing between the defaults and a freshly-recorded binding. */
function normalizeCombo(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .sort()
    .join("+");
}

// The DOM's KeyboardEvent, not React's - this file also imports the latter (as
// `KeyboardEvent`, from "react") for the page-tab arrow-key handler below, and a
// window-level "keydown" listener always receives the native DOM event.
function comboFromEvent(event: globalThis.KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("ctrl");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  if (!["Control", "Alt", "Shift", "Meta"].includes(event.key)) {
    parts.push(event.key.toLowerCase());
  }
  return parts.sort().join("+");
}

export function ProjectOverviewPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceOut }>();
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showShare, setShowShare] = useState(false);
  const [showPages, setShowPages] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const [commentsRevealSignal, setCommentsRevealSignal] = useState(0);
  const [iframeStatus, setIframeStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [retryCount, setRetryCount] = useState(0);
  const canvasRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const frameShellRef = useRef<HTMLDivElement>(null);
  // Memoizes the canvas URL against the target it was built for - see where iframeSrc
  // is assembled below for why the mode can't be part of that rebuild.
  const frameSrcRef = useRef<{ target: string | null; frameKey: string | null; src: string | null }>({ target: null, frameKey: null, src: null });
  // The page the canvas navigated to by itself (a link, a login redirect, an SPA route
  // change). The URL follows it so the page stays selected, but the iframe is already
  // showing it - reloading would double every navigation and throw away a signed-in
  // SPA's in-memory session. Cleared whenever a page is picked from outside the frame.
  const frameDrivenPageRef = useRef<string | null>(null);
  const pageTabsRef = useRef<HTMLDivElement>(null);
  // Live width while the resize handle is held down. `undefined` means "not
  // resizing" and defers to the URL-persisted width; `null` is a real value the
  // drag can produce (snapped back to filling the container).
  const [dragWidth, setDragWidth] = useState<number | null | undefined>(undefined);
  const queryClient = useQueryClient();
  const { user, role } = useAuth();

  useEffect(() => {
    const handleOpenShortcuts = () => setShowShortcuts(true);
    window.addEventListener("backline:open-shortcuts", handleOpenShortcuts);
    return () => window.removeEventListener("backline:open-shortcuts", handleOpenShortcuts);
  }, []);

  const activePageIdParam = searchParams.get("page");
  const searchMode = searchParams.get("mode");
  const mode: CanvasMode = searchMode === "browse" ? "browse" : searchMode === "draw" ? "draw" : "comment";
  const orientation = searchParams.get("orientation") === "landscape" ? "landscape" : "portrait";
  const zoomScale = clampZoom(Number(searchParams.get("zoom") ?? 1));
  const viewport = useMemo<ViewportOption | null>(() => {
    const name = searchParams.get("viewport");
    if (!name) return null;
    if (name === "Custom") {
      const width = Number(searchParams.get("viewportWidth"));
      const height = Number(searchParams.get("viewportHeight"));
      if (width >= 280 && width <= 2560 && height >= 320 && height <= 2000) {
        return { name, width, height };
      }
      return null;
    }
    return VIEWPORTS.find((option) => option.name === name) ?? null;
  }, [searchParams]);
  // Width the reviewer dragged the responsive ("Fit canvas") frame to. Only meaningful
  // without a viewport preset: a preset owns both of its dimensions, so its frame is
  // resized from ViewportMenu rather than by dragging, exactly like device mode in
  // Chrome DevTools.
  const stageWidth = useMemo<number | null>(() => {
    const raw = Number(searchParams.get("stageWidth"));
    if (!Number.isFinite(raw) || raw < 280 || raw > 4096) return null;
    return Math.round(raw);
  }, [searchParams]);
  const fitWidth = dragWidth !== undefined ? dragWidth : stageWidth;
  const isResizingFrame = dragWidth !== undefined;
  const browser = useMemo<BrowserOption>(() => {
    const name = searchParams.get("browser");
    if (!name) return BROWSERS[0];
    return BROWSERS.find((option) => option.name === name) ?? BROWSERS[0];
  }, [searchParams]);

  const pagesQuery = useQuery({
    queryKey: qk.projectPages(projectId ?? ""),
    queryFn: () => apiFetch<PageOut[]>(`/api/v1/projects/${projectId}/pages`),
    enabled: !!projectId,
  });
  const projectQuery = useQuery({
    queryKey: qk.project(projectId ?? ""),
    queryFn: () => projectsApi.getProject(projectId!),
    enabled: !!projectId,
  });
  const shareLinksQuery = useQuery({
    queryKey: qk.shareLinks(projectId ?? ""),
    queryFn: () => shareLinksApi.listShareLinks(projectId!),
    enabled: !!projectId,
  });
  const commentsQuery = useQuery({
    queryKey: qk.projectComments(projectId ?? ""),
    queryFn: () => boardApi.listProjectComments(projectId!),
    enabled: !!projectId,
  });
  const hasProxyCandidate = (shareLinksQuery.data ?? []).some(
    (link) => link.revoked_at === null && link.mode === "proxy",
  );

  // Hoisted above every early return below (project.isLoading/.error/.archived_at/
  // non-website type) so useBrowserRenderSnapshot is never called conditionally -
  // React's Rules of Hooks require every hook to run in the same order on every
  // render, loading/error states included. None of these actually need the narrowed
  // `project` const those guards produce, only the raw queries, so they're safe here.
  const sortedPages = [...(pagesQuery.data ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const activePage =
    sortedPages.find((page) => page.id === activePageIdParam) ??
    sortedPages.find((page) => page.id === currentPageId) ??
    sortedPages[0] ??
    null;
  const visibleWidth = viewport
    ? orientation === "portrait"
      ? viewport.width
      : viewport.height
    : undefined;
  const visibleHeight = viewport
    ? orientation === "portrait"
      ? viewport.height
      : viewport.width
    : undefined;
  // Chrome (BROWSERS[0]) stays the live, interactive proxy iframe exactly as before -
  // only a real non-Chrome pick, on a project that has opted into the real-render
  // project setting, switches the stage over to a rendered screenshot. Projects that
  // haven't turned the setting on keep today's behavior unchanged: the dropdown still
  // tags the browser on new comments (the blBrowser search param below), it just
  // doesn't visually change the canvas.
  const isCrossBrowserRenderActive =
    browser.name !== BROWSERS[0].name &&
    Boolean(projectQuery.data?.settings.enable_cross_browser_render);
  // Deliberately the *un*-swapped viewport (not visibleWidth/visibleHeight above,
  // which already flip width/height for landscape display) - the render request sends
  // this plus `orientation` separately, and backend/app/modules/browser_render/
  // service.py's run_render() does its own single portrait/landscape swap. Feeding it
  // the already-swapped display dimensions would flip them a second time and cancel
  // the swap out, producing a portrait-shaped render for a landscape request.
  const renderBaseWidth = viewport?.width ?? DEFAULT_RENDER_WIDTH;
  const renderBaseHeight = viewport?.height ?? DEFAULT_RENDER_HEIGHT;
  // For the snapshot shell's own CSS box (visual only) - this one *should* already
  // reflect orientation, the same way the live iframe shell's visibleWidth/
  // visibleHeight do below.
  const renderWidth = visibleWidth ?? renderBaseWidth;
  const renderHeight = visibleHeight ?? renderBaseHeight;
  const browserRender = useBrowserRenderSnapshot({
    projectId: isCrossBrowserRenderActive ? (projectQuery.data?.id ?? null) : null,
    pageId: isCrossBrowserRenderActive ? (activePage?.id ?? null) : null,
    browser: browser.name,
    width: renderBaseWidth,
    height: renderBaseHeight,
    orientation,
    // hasProxyCandidate rather than the later `iframeSrc`: this hook is declared
    // before the early-return guards, so it can't reference anything computed after
    // them, but an active proxy link existing is a close-enough stand-in for "there's
    // something to render" without duplicating iframeSrc's own resolution logic here.
    enabled: isCrossBrowserRenderActive && Boolean(activePage) && hasProxyCandidate,
  });

  // Global hotkeys for the shortcuts ShortcutsModal/QuickToolsDock advertise ("Add
  // Comment (C)", "Draw Region (D)", ...) - without this the modal only ever relabeled
  // a key, it never actually bound one. Reads the reviewer's saved bindings (or the
  // defaults) fresh on every keydown rather than once, so editing a shortcut applies
  // immediately. Suppressed while any modal is open or while typing in a field, so it
  // never hijacks normal text entry (e.g. a comment body that happens to contain "c").
  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (showShare || showPages || showSettings || showShortcuts) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;

      const combo = comboFromEvent(event);
      const shortcut = loadShortcuts().find((s) => normalizeCombo(s.key) === combo);
      if (!shortcut) return;

      if (shortcut.id === "comment" || shortcut.id === "draw" || shortcut.id === "browse") {
        event.preventDefault();
        setMode(shortcut.id);
        return;
      }
      if (shortcut.id === "next-page" || shortcut.id === "prev-page") {
        const ids = [...(pagesQuery.data ?? [])]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((page) => page.id);
        if (ids.length === 0) return;
        const currentIndex = Math.max(0, ids.indexOf(activePageIdParam ?? ""));
        const step = shortcut.id === "next-page" ? 1 : -1;
        event.preventDefault();
        goToPage(ids[(currentIndex + step + ids.length) % ids.length]);
      }
      // "hide-dock" (Ctrl .) is already handled by QuickToolsDock's own listener.
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showShare, showPages, showSettings, showShortcuts, activePageIdParam, pagesQuery.data]);

  const upsertComment = useCallback(
    (payload: CommentOut & { project_id: string }) => {
      if (payload.project_id !== projectId) return;
      upsertProjectComment(queryClient, projectId ?? "", payload);
    },
    [projectId, queryClient],
  );
  useWSEvent("comment.created", upsertComment);
  useWSEvent("comment.updated", upsertComment);

  const removeComment = useCallback(
    (payload: { comment_id: string; project_id: string }) => {
      if (payload.project_id !== projectId) return;
      removeProjectComment(queryClient, projectId ?? "", payload.comment_id);
    },
    [projectId, queryClient],
  );
  useWSEvent("comment.deleted", removeComment);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== canvasRef.current?.contentWindow) return;
      if (event.data?.type !== "backline:page-registered") return;
      const pageId = event.data.pageId as string;
      frameDrivenPageRef.current = pageId;
      setCurrentPageId(pageId);
      setIframeStatus("loaded");
      setSearchParams(
        (previous) => {
          if (previous.get("page") === pageId) return previous;
          const next = new URLSearchParams(previous);
          next.set("page", pageId);
          return next;
        },
        { replace: true },
      );
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [setSearchParams]);

  // Clicking an existing pin inside the canvas (widget thread-manager.ts) opens the
  // Comments drawer with that comment selected - the reverse of clicking a comment in
  // the drawer to find its pin.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== canvasRef.current?.contentWindow) return;
      if (event.data?.type !== "backline:comment-opened") return;
      const commentId: unknown = event.data.commentId;
      if (typeof commentId !== "string") return;
      setSelectedCommentId(commentId);
      setCommentsRevealSignal((count) => count + 1);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Answers the canvas widget's name request (widget guest-session.ts's
  // requestDashboardDisplayName) with the signed-in member's own name, so the widget
  // doesn't show its guest "Your name" prompt to someone who's already signed in.
  const memberDisplayName = user?.name.trim() || user?.email || "";
  useEffect(() => {
    if (!memberDisplayName) return;
    function onMessage(event: MessageEvent) {
      const canvasWindow = canvasRef.current?.contentWindow;
      if (!canvasWindow || event.source !== canvasWindow) return;
      if (event.data?.type !== "backline:request-display-name") return;
      canvasWindow.postMessage({ type: "backline:display-name", displayName: memberDisplayName }, event.origin);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [memberDisplayName]);

  // The canvas widget's comment card has a status menu in its header (widget
  // dashboard-bridge.ts), but the widget itself runs as a guest, and guests can't change
  // a status - so it asks this page, where the member is signed in, to make the change
  // with the member's own session. Every workspace role holds comment:update_status
  // (backend core/permissions.py); anything else gets the card's read-only status.
  const canUpdateStatus = role === "owner" || role === "admin" || role === "member";
  const statusMutation = useMutation({
    mutationFn: ({ commentId, status }: { commentId: string; status: CommentStatus }) =>
      boardApi.updateComment(commentId, { status }),
    onSuccess: (updated) => upsertProjectComment(queryClient, projectId ?? "", updated),
  });
  const updateStatusFromCanvas = statusMutation.mutateAsync;
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const canvasWindow = canvasRef.current?.contentWindow;
      if (!canvasWindow || event.source !== canvasWindow) return;
      const data = event.data;
      if (data?.type === "backline:request-status-access") {
        canvasWindow.postMessage({ type: "backline:status-access", canUpdateStatus }, event.origin);
        return;
      }
      if (data?.type !== "backline:update-comment-status") return;
      const { requestId, commentId, status } = data as { requestId: unknown; commentId: unknown; status: unknown };
      if (typeof requestId !== "string" || typeof commentId !== "string") return;
      const origin = event.origin;
      const reply = (result: { ok: true; status: CommentStatus } | { ok: false }) =>
        canvasWindow.postMessage({ type: "backline:comment-status-result", requestId, ...result }, origin);
      if (!canUpdateStatus || !WORKFLOW_STATUSES.includes(status as CommentStatus)) {
        reply({ ok: false });
        return;
      }
      updateStatusFromCanvas({ commentId, status: status as CommentStatus }).then(
        (updated) => reply({ ok: true, status: updated.status }),
        () => reply({ ok: false }),
      );
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [canUpdateStatus, updateStatusFromCanvas]);

  // Switching Comment/Browse/Draw is driven into the already-loaded canvas rather than
  // reloading it with a new blMode (the widget's own set-mode listener, index.ts): a
  // reload discarded every pin, open thread, unsent composer and the reviewer's scroll
  // position, and visibly re-fetched the whole site on each toggle. Only once the frame
  // has actually loaded - postMessage to an origin the frame isn't on yet is dropped
  // (and logged) by the browser, and a fresh load is covered by the handler below.
  useEffect(() => {
    if (iframeStatus !== "loaded") return;
    canvasRef.current?.contentWindow?.postMessage({ type: "backline:set-mode", mode }, CANVAS_ORIGIN);
  }, [iframeStatus, mode]);

  // Every fresh widget instance announces itself with page-registered, including one
  // from a link the reviewer followed inside the canvas - that navigation carries no
  // blMode of its own, so this is what keeps Browse mode from quietly turning back
  // into Comment mode one click into the site.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const canvasWindow = canvasRef.current?.contentWindow;
      if (!canvasWindow || event.source !== canvasWindow) return;
      if (event.data?.type !== "backline:page-registered") return;
      canvasWindow.postMessage({ type: "backline:set-mode", mode }, CANVAS_ORIGIN);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [mode]);

  // Deliberately not keyed on `mode`: mode changes no longer reload the canvas, so a
  // "loading" state entered here would have no load event left to clear it and would
  // sit there until the timeout below called it an error.
  useEffect(() => {
    if (!hasProxyCandidate) return;
    // The frame reported this page itself, so it's already loaded - a "loading" state
    // here would have no load event coming to clear it and would time out as an error.
    if (activePageIdParam !== null && activePageIdParam === frameDrivenPageRef.current) return;
    setIframeStatus("loading");
    const timer = window.setTimeout(() => {
      setIframeStatus((current) => current === "loading" ? "error" : current);
    }, 30000);
    return () => window.clearTimeout(timer);
  }, [activePageIdParam, hasProxyCandidate, projectId, retryCount]);

  function updateViewParams(values: Record<string, string | null>) {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(values)) {
          if (value === null) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );
  }

  function goToPage(pageId: string) {
    frameDrivenPageRef.current = null;
    setCurrentPageId(null);
    setSelectedCommentId(null);
    updateViewParams({ page: pageId || null });
  }

  function setMode(nextMode: CanvasMode) {
    updateViewParams({ mode: nextMode === "comment" ? null : nextMode });
  }

  function setViewport(nextViewport: ViewportOption | null) {
    updateViewParams({
      viewport: nextViewport?.name ?? null,
      viewportWidth: nextViewport?.name === "Custom" ? String(nextViewport.width) : null,
      viewportHeight: nextViewport?.name === "Custom" ? String(nextViewport.height) : null,
      orientation: nextViewport ? searchParams.get("orientation") : null,
      // Picking any viewport - including "Fit canvas" - is an explicit size choice, so
      // it clears a width left behind by an earlier drag instead of silently restoring it.
      stageWidth: null,
    });
  }

  function onFrameResize(nextWidth: number | null, phase: ResizePhase) {
    if (phase === "drag") {
      setDragWidth(nextWidth);
      return;
    }
    setDragWidth(undefined);
    updateViewParams({ stageWidth: nextWidth === null ? null : String(nextWidth) });
  }

  function setZoom(nextZoom: number) {
    const normalized = clampZoom(nextZoom);
    updateViewParams({ zoom: normalized === 1 ? null : normalized.toFixed(1) });
  }

  function reloadPreview() {
    // Rebuilt from the selected page, not the src first handed to the frame - that one
    // may be several in-frame navigations behind what the reviewer is looking at.
    frameDrivenPageRef.current = null;
    frameSrcRef.current = { target: null, frameKey: null, src: null };
    setIframeStatus("loading");
    setRetryCount((count) => count + 1);
  }

  function onPageTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number, pageIds: string[]) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % pageIds.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + pageIds.length) % pageIds.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = pageIds.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    goToPage(pageIds[nextIndex]);
    requestAnimationFrame(() => {
      const tabs = pageTabsRef.current?.querySelectorAll<HTMLButtonElement>("[data-page-tab]");
      tabs?.[nextIndex!]?.focus();
    });
  }

  if (projectQuery.isLoading) {
    return (
      <main className="bl-review-gate" aria-busy="true">
        <span className="bl-loading-mark" aria-hidden="true">B</span>
        <div className="bl-review-gate-copy">
          <span className="bl-review-eyebrow">Review workspace</span>
          <h1>Opening project</h1>
          <div className="bl-review-gate-line" aria-hidden="true"><i /></div>
        </div>
      </main>
    );
  }

  if (projectQuery.error || !projectQuery.data) {
    return (
      <main className="bl-review-gate">
        <span className="bl-loading-mark" aria-hidden="true">B</span>
        <div className="bl-review-gate-copy">
          <span className="bl-review-eyebrow">Review workspace</span>
          <h1>{projectQuery.error ? "Couldn’t load this project" : "Project not found"}</h1>
          <p>{projectQuery.error?.message ?? "The project may have moved or you may no longer have access."}</p>
          <div className="bl-review-gate-actions">
            {projectQuery.error && <button type="button" className="bl-button" onClick={() => void projectQuery.refetch()}>Try again</button>}
            <Link className="bl-quiet" to={`/w/${workspace.slug}`}>All projects</Link>
          </div>
        </div>
      </main>
    );
  }

  const project = projectQuery.data;
  if (project.archived_at) {
    return (
      <main className="bl-review-gate">
        <span className="bl-loading-mark" aria-hidden="true">B</span>
        <div className="bl-review-gate-copy">
          <span className="bl-review-eyebrow">Archived project</span>
          <h1>{project.name}</h1>
          <p>Restore this project before opening its review workspace. Its comments and history are still retained.</p>
          <Link className="bl-button" to={`/w/${workspace.slug}?archived=true`}>View archived projects</Link>
        </div>
      </main>
    );
  }

  if (project.project_type && project.project_type !== "website") {
    return <AssetReview projectId={project.id} title={project.name} workspaceSlug={workspace.slug} />;
  }

  const activeLinks = (shareLinksQuery.data ?? []).filter((link) => link.revoked_at === null);
  const reviewLink = activeLinks[0] ?? null;
  const embedLink = activeLinks.find((link) => link.mode === "proxy") ?? null;
  const canvasUrl = embedLink ? `${API_BASE_URL}/proxy/${embedLink.token}/` : null;

  function proxyRequestFor(page: PageOut | null): { path: string; search: URLSearchParams } | null {
    if (!page) return { path: "", search: new URLSearchParams() };
    try {
      const pageUrl = new URL(page.url_normalized);
      const targetUrl = new URL(project.target_origin);
      if (pageUrl.host !== targetUrl.host) return null;
      return { path: pageUrl.pathname.replace(/^\//, ""), search: new URLSearchParams(pageUrl.search) };
    } catch {
      return null;
    }
  }

  const activePageRequest = proxyRequestFor(activePage);
  const iframeSearch = new URLSearchParams(activePageRequest?.search);
  // Threads the footer's BrowserMenu selection into the widget so it's recorded on any
  // comment created from this canvas - see the widget's blBrowser handling in index.ts.
  iframeSearch.set("blBrowser", browser.name);
  const canvasTarget = canvasUrl && activePageRequest
    ? `${API_BASE_URL}/proxy/${embedLink!.token}/${activePageRequest.path}?${iframeSearch.toString()}`
    : null;
  // blMode is the mode the canvas is *loaded* with, so it's only rebuilt when the
  // target itself changes (a different page, a different browser, a revoked link).
  // Putting the live mode in here instead would change the iframe's src on every
  // Comment/Browse/Draw toggle and reload the whole site; postCanvasMode above carries
  // the switch into the running widget instead. The ref is a memo of the URL already
  // handed to the iframe, not state - nothing renders off it but the iframe itself.
  // Everything but the page: a different link or browser still reloads the canvas, even
  // on a page the frame navigated to by itself.
  const frameKey = embedLink ? `${embedLink.token}|${browser.name}` : null;
  if (frameSrcRef.current.target !== canvasTarget) {
    const keepFrame =
      canvasTarget !== null &&
      frameSrcRef.current.src !== null &&
      frameSrcRef.current.frameKey === frameKey &&
      activePageIdParam !== null &&
      activePageIdParam === frameDrivenPageRef.current;
    frameSrcRef.current = {
      target: canvasTarget,
      frameKey,
      src: keepFrame ? frameSrcRef.current.src : canvasTarget ? `${canvasTarget}&blMode=${mode}` : null,
    };
  }
  const iframeSrc = frameSrcRef.current.src;
  const displayUrl = activePage?.url_normalized || project.target_origin;
  const topLevelComments = (commentsQuery.data ?? []).filter((comment) => !comment.parent_id);
  const selectedCommentNumber = selectedCommentId
    ? topLevelComments
        .slice()
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .findIndex((comment) => comment.id === selectedCommentId) + 1
    : 0;
  const pageIds = sortedPages.map((page) => page.id);
  const effectiveFrameStatus = iframeSrc ? iframeStatus : "unavailable";

  return (
    <main className="bl-review-workspace">
      <header className="bl-review-header">
        <div className="bl-review-identity">
          <Link to={`/w/${workspace.slug}`} className="bl-review-icon-button" aria-label="Back to all projects" title="All projects">
            <ArrowLeftIcon />
          </Link>
          <div>
            <div className="bl-review-title-line">
              <h1>{project.name}</h1>
              <span className={`bl-review-environment is-${project.environment}`}>
                <i aria-hidden="true" />
                {project.environment}
              </span>
            </div>
            <a href={displayUrl} target="_blank" rel="noreferrer" className="bl-review-url" title="Open the live page in a new tab">
              <span>{displayUrl.replace(/^https?:\/\//, "")}</span>
              <ExternalLinkIcon width={10} height={10} />
            </a>
          </div>
        </div>

        <div className="bl-review-header-tools">
          <div className="bl-review-mode" aria-label="Canvas mode">
            <button type="button" aria-pressed={mode === "browse"} onClick={() => setMode("browse")}>
              <PointerIcon width={13} height={13} />
              Browse
            </button>
            <button type="button" aria-pressed={mode === "comment"} onClick={() => setMode("comment")}>
              <CommentsIcon width={13} height={13} />
              Comment
            </button>
          </div>
          <button type="button" className="bl-review-icon-button" aria-label="Reload preview" title="Reload preview" onClick={reloadPreview} disabled={!iframeSrc}>
            <ReloadIcon className={iframeStatus === "loading" && iframeSrc ? "bl-is-spinning" : ""} />
          </button>
          <a className="bl-review-icon-button" href={displayUrl} target="_blank" rel="noreferrer" aria-label="Open live page" title="Open live page">
            <ExternalLinkIcon />
          </a>
          {reviewLink ? (
            <a className="bl-review-control bl-review-open" href={reviewUrl(reviewLink.token)} target="_blank" rel="noreferrer">
              Open review
              <ExternalLinkIcon width={12} height={12} />
            </a>
          ) : (
            <button type="button" className="bl-review-control" disabled title="Create a review link from Share first">Open review</button>
          )}
          <button type="button" className="bl-review-control" onClick={() => setShowShare(true)}>
            <ShareIcon width={13} height={13} />
            Share
          </button>
          <ThemeToggle />
          <ProjectMenu
            project={project}
            workspaceSlug={workspace.slug}
            onManagePages={() => setShowPages(true)}
            onShare={() => setShowShare(true)}
            onSettings={() => setShowSettings(true)}
          />
        </div>
      </header>

      <div className="bl-review-pagebar">
        <div className="bl-review-page-tabs" ref={pageTabsRef} role={sortedPages.length > 0 ? "tablist" : undefined} aria-label={sortedPages.length > 0 ? "Project pages" : undefined}>
          {pagesQuery.isLoading && (
            <div className="bl-review-tabs-loading" role="status" aria-label="Loading project pages">
              <i /><i /><i />
            </div>
          )}
          {pagesQuery.error && (
            <div className="bl-review-page-error" role="alert">
              <span>Pages unavailable.</span>
              <button type="button" onClick={() => void pagesQuery.refetch()}>Retry</button>
            </div>
          )}
          {!pagesQuery.isLoading && !pagesQuery.error && sortedPages.length === 0 && (
            <span className="bl-review-page-empty">No saved pages yet. The first proxied visit can register one.</span>
          )}
          {sortedPages.map((page, index) => (
            <button
              key={page.id}
              type="button"
              role="tab"
              data-page-tab
              tabIndex={activePage?.id === page.id ? 0 : -1}
              aria-selected={activePage?.id === page.id}
              onClick={() => goToPage(page.id)}
              onKeyDown={(event) => onPageTabKeyDown(event, index, pageIds)}
            >
              <span>{pageLabel(page)}</span>
              {activePage?.id === page.id && <i aria-hidden="true" />}
            </button>
          ))}
        </div>
        <button type="button" className="bl-review-manage-pages" onClick={() => setShowPages(true)}>
          Manage pages
        </button>
      </div>

      <section className="bl-review-main" aria-label="Website review canvas">
        <div
          ref={stageRef}
          className={`bl-review-stage ${mode === "comment" || mode === "draw" ? "is-commenting" : "is-browsing"} ${mode === "draw" ? "is-drawing" : ""}`}
        >
          {shareLinksQuery.isLoading ? (
            <div className="bl-review-empty-canvas" role="status">
              <span className="bl-review-loader" aria-hidden="true" />
              <strong>Preparing the review source</strong>
              <p>Checking for an active proxy review link…</p>
            </div>
          ) : shareLinksQuery.error ? (
            <div className="bl-review-empty-canvas" role="alert">
              <span className="bl-review-state-icon is-warning"><GlobeIcon /></span>
              <strong>Couldn’t check the review link</strong>
              <p>{shareLinksQuery.error.message}</p>
              <button type="button" className="bl-button" onClick={() => void shareLinksQuery.refetch()}>Try again</button>
            </div>
          ) : embedLink && !activePageRequest ? (
            <div className="bl-review-empty-canvas" role="alert">
              <span className="bl-review-state-icon is-warning"><GlobeIcon /></span>
              <strong>This saved page is outside the project URL</strong>
              <p>Backline will not proxy a page from a different host. Update the page or project URL before reviewing it here.</p>
              <div className="bl-review-empty-actions">
                <button type="button" className="bl-button" onClick={() => setShowPages(true)}>Manage pages</button>
                <button type="button" className="bl-quiet" onClick={() => setShowSettings(true)}>Check project URL</button>
              </div>
            </div>
          ) : iframeSrc && isCrossBrowserRenderActive ? (
            <div
              className="bl-live-frame-shell is-fixed bl-render-snapshot"
              style={{ width: renderWidth, height: renderHeight, zoom: zoomScale } as CSSProperties}
            >
              <div className="bl-live-frame-bar">
                <span className="bl-live-frame-lights" aria-hidden="true"><i /><i /><i /></span>
                <span className="bl-live-frame-address" title={displayUrl}>{displayUrl.replace(/^https?:\/\//, "")}</span>
                <span className="bl-live-frame-source">
                  <i aria-hidden="true" />
                  Rendered as {browser.name}
                </span>
                <button
                  type="button"
                  onClick={browserRender.refresh}
                  aria-label={`Refresh the ${browser.name} render`}
                  title={`Refresh the ${browser.name} render`}
                  disabled={browserRender.isLoading}
                >
                  <ReloadIcon width={13} height={13} className={browserRender.isLoading ? "bl-is-spinning" : ""} />
                </button>
              </div>
              <div className="bl-live-frame-canvas">
                {browserRender.error ? (
                  <div className="bl-iframe-state is-error" role="alert">
                    <span className="bl-review-state-icon is-warning"><GlobeIcon /></span>
                    <strong>Couldn’t request a {browser.name} render</strong>
                    <p>{browserRender.error}</p>
                    <div>
                      <button type="button" className="bl-button" onClick={browserRender.refresh}>Try again</button>
                    </div>
                  </div>
                ) : browserRender.status?.status === "failed" ? (
                  <div className="bl-iframe-state is-error" role="alert">
                    <span className="bl-review-state-icon is-warning"><GlobeIcon /></span>
                    <strong>The {browser.name} render failed</strong>
                    <p>{browserRender.status.error ?? "The target page didn’t load in time for this engine."}</p>
                    <div>
                      <button type="button" className="bl-button" onClick={browserRender.refresh}>Try again</button>
                    </div>
                  </div>
                ) : browserRender.status?.status === "ready" && browserRender.status.screenshot_url ? (
                  <img
                    src={browserRender.status.screenshot_url}
                    alt={`${displayUrl} rendered in ${browser.name}`}
                    className="bl-render-snapshot-img"
                  />
                ) : (
                  <div className="bl-iframe-state is-loading" role="status">
                    <span className="bl-review-loader" aria-hidden="true" />
                    <strong>Rendering in {browser.name}</strong>
                    <span className="bl-iframe-steps" aria-hidden="true"><i /><i /><i /></span>
                    <p>Backline is loading this page in a real {browser.name} engine on its render worker. This usually takes a few seconds.</p>
                  </div>
                )}
              </div>
              <div className="bl-live-frame-meta">
                <span>
                  {browserRender.status?.status === "ready" && browserRender.status.rendered_at
                    ? `Static ${browser.name} screenshot — comment pins aren’t available here yet. Switch to Chrome to comment.`
                    : `Preparing a real ${browser.name} render…`}
                </span>
                <span>Source: {ENGINE_LABEL[browser.name] ?? "render worker"}</span>
              </div>
            </div>
          ) : iframeSrc ? (
            <div
              ref={frameShellRef}
              className={`bl-live-frame-shell ${viewport ? "is-fixed" : "is-fit"}${isResizingFrame ? " is-resizing" : ""}`}
              style={{ width: visibleWidth ?? fitWidth ?? undefined, height: visibleHeight, zoom: zoomScale } as CSSProperties}
            >
              <div className="bl-live-frame-bar">
                <span className="bl-live-frame-lights" aria-hidden="true"><i /><i /><i /></span>
                <span className="bl-live-frame-address" title={displayUrl}>{displayUrl.replace(/^https?:\/\//, "")}</span>
                <span className="bl-live-frame-source"><i aria-hidden="true" />Safe proxy</span>
                <button type="button" onClick={reloadPreview} aria-label="Reload proxy preview" title="Reload proxy preview">
                  <ReloadIcon width={13} height={13} className={iframeStatus === "loading" ? "bl-is-spinning" : ""} />
                </button>
              </div>
              <div className="bl-live-frame-canvas">
                <iframe
                  key={`${retryCount}-${iframeSrc}`}
                  ref={canvasRef}
                  src={iframeSrc}
                  title={`${project.name} preview`}
                  onLoad={() => setIframeStatus("loaded")}
                  onError={() => setIframeStatus("error")}
                />
                {iframeStatus === "loading" && (
                  <div className="bl-iframe-state is-loading" role="status">
                    <span className="bl-review-loader" aria-hidden="true" />
                    <strong>Loading {displayUrl.replace(/^https?:\/\//, "")}</strong>
                    <span className="bl-iframe-steps" aria-hidden="true"><i /><i /><i /></span>
                    <p>Backline is loading the page through the private review proxy so its real widget pins can attach safely.</p>
                  </div>
                )}
                {iframeStatus === "error" && (
                  <div className="bl-iframe-state is-error" role="alert">
                    <span className="bl-review-state-icon is-warning"><GlobeIcon /></span>
                    <strong>Couldn’t load this page</strong>
                    <p>The address may be unavailable, behind a login, or blocking the review proxy.</p>
                    <div>
                      <button type="button" className="bl-button" onClick={reloadPreview}>Try again</button>
                      <a className="bl-quiet" href={displayUrl} target="_blank" rel="noreferrer">Open live page</a>
                      <button type="button" className="bl-quiet" onClick={() => setShowSettings(true)}>Check URL</button>
                    </div>
                  </div>
                )}
              </div>
              <div className="bl-live-frame-meta">
                <span>{selectedCommentNumber > 0 ? `Comment ${selectedCommentNumber} selected — locating its pin` : mode === "comment" ? "Comment mode — click the page to place a pin" : mode === "draw" ? "Draw mode — click and drag to select an area" : "Browse mode — page interactions enabled"}</span>
                <span>Source: proxy</span>
              </div>
              {!viewport && (
                <CanvasResizer
                  shellRef={frameShellRef}
                  stageRef={stageRef}
                  zoom={zoomScale}
                  width={fitWidth}
                  onResize={onFrameResize}
                />
              )}
            </div>
          ) : (
            <div className="bl-review-empty-canvas">
              <span className="bl-review-state-icon"><ShareIcon /></span>
              <strong>{reviewLink ? "A proxy review link is required" : "No active review link yet"}</strong>
              <p>{reviewLink ? "The active link uses snippet mode and cannot power this embedded canvas. Create a proxy link to review here." : "Create a proxy review link to load the live site and its genuine comment pins in this workspace."}</p>
              <button type="button" className="bl-button mint" onClick={() => setShowShare(true)}>Open Share</button>
              <span>Nothing is simulated until a real link exists.</span>
            </div>
          )}
        </div>

        <QuickToolsDock
          environment={project.environment}
          mode={mode}
          onModeChange={(m) => setMode(m)}
        />

        <ProjectSidePanel
          project={project}
          workspaceId={workspace.id}
          workspaceSlug={workspace.slug}
          workspaceName={workspace.name}
          canvasRef={canvasRef}
          currentPageId={currentPageId}
          selectedCommentId={selectedCommentId}
          onSelectComment={setSelectedCommentId}
          revealCommentsSignal={commentsRevealSignal}
        />
      </section>

      <ProjectFooter
        project={project}
        workspaceId={workspace.id}
        workspaceSlug={workspace.slug}
        workspaceName={workspace.name}
        totalComments={topLevelComments.length}
        commentsUnavailable={Boolean(commentsQuery.error)}
        currentPageId={activePage?.id ?? null}
        onSelectPage={goToPage}
        viewport={viewport}
        onViewportChange={setViewport}
        fitWidth={fitWidth}
        browser={browser}
        onBrowserChange={(nextBrowser) => updateViewParams({ browser: nextBrowser.name === BROWSERS[0].name ? null : nextBrowser.name })}
        orientation={orientation}
        onOrientationChange={(nextOrientation) => updateViewParams({ orientation: nextOrientation === "portrait" ? null : nextOrientation })}
        zoomScale={zoomScale}
        onZoomChange={setZoom}
        iframeStatus={effectiveFrameStatus}
      />

      {showShare && (
        <ShareProjectModal
          project={project}
          workspaceId={workspace.id}
          workspaceSlug={workspace.slug}
          workspaceName={workspace.name}
          onClose={() => setShowShare(false)}
        />
      )}
      {showPages && (
        <ProjectPagesModal
          project={project}
          activePageId={activePage?.id ?? null}
          onOpenPage={goToPage}
          onClose={() => setShowPages(false)}
        />
      )}
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
      {showSettings && <ProjectForm workspace={workspace} project={project} onClose={() => setShowSettings(false)} />}
    </main>
  );
}
