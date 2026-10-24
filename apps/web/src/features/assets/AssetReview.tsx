import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useDraftNavigationGuard } from "../../lib/draft-navigation";
import { qk } from "../../lib/query-keys";
import { useOnlineStatus } from "../../lib/use-online-status";
import { ApiError } from "../../lib/api-client";
import { formatRelativeTime } from "../../lib/date-format";
import { ticketRef } from "../../lib/ticket-ref";
import { Avatar, LayerBadge, StatusBadge } from "@backline/ui";
import { STATUS_COLORS, TAGS } from "../../lib/workflow";
import * as api from "./api";
import type { ProjectOut } from "../projects/api";
import { projectCan } from "../../lib/project-roles";
import { ManageFilesDialog } from "./ManageFilesDialog";
import { AssetPreview } from "./AssetPreview";
import { ThemeToggle } from "../../components/ThemeToggle";
import { MediaAttachment, RecordButtons } from "../comments/RecordButtons";
import { isMediaAttachment } from "../comments/media";
import { ProjectMenu } from "../projects/ProjectMenu";
import { ArrowLeftIcon, CommentsIcon, PointerIcon, ShareIcon, ZoomInIcon, ZoomOutIcon } from "../projects/panel/icons";
import type { Schemas } from "@backline/types";

type Comment = Schemas["CommentOut"];

/** What the team's side panel (ProjectSidePanel) needs from the file canvas. */
export interface AssetSidePanelContext {
  currentPageId: string | null;
  selectedCommentId: string | null;
  onRevealComment: (commentId: string) => void;
  openCommentRequest: { commentId: string; nonce: number } | null;
}

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function documentPage(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 200 ? parsed : 1;
}

function accessDenied(error: unknown): boolean {
  return error instanceof ApiError && [401, 403, 404, 409].includes(error.status);
}

function regionOf(comment: Comment): api.Region | undefined {
  return (comment.anchor as { region?: api.Region } | undefined)?.region;
}

function hasArea(region: api.Region): boolean {
  return Boolean(region.width && region.height);
}

function pinLabel(comment: Comment): string {
  return ticketRef(comment).replace(/^#/, "");
}

function RotateIcon({ direction }: { direction: "left" | "right" }) {
  return <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={direction === "right" ? { transform: "scaleX(-1)" } : undefined}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" />
  </svg>;
}

function DownloadIcon() {
  return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>;
}

function FileGlyph({ pdf }: { pdf: boolean }) {
  return pdf
    ? <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z" /><path d="M14 2v5h5" /></svg>
    : <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.7" /><path d="M21 15l-5-5L5 20" /></svg>;
}

function AttachmentList({ attachments }: { attachments: Comment["attachments"] }) {
  if (!attachments.length) return null;
  return <div className="bl-asset-attachments">
    {attachments.map((file) => isMediaAttachment(file.content_type)
      ? <MediaAttachment key={file.url} url={file.url} filename={file.filename} contentType={file.content_type} />
      : <a key={file.url} className="bl-chip" href={file.url} target="_blank" rel="noreferrer">{file.filename} ↗</a>)}
  </div>;
}

export function AssetReview({
  projectId,
  title,
  guest,
  guestName,
  onLeave,
  workspaceSlug,
  project,
  requestedComment,
  onShare,
  onSettings,
  renderSidePanel,
  variant,
  branding,
}: {
  projectId: string;
  title: string;
  guest?: string;
  guestName?: string;
  onLeave?: () => void;
  workspaceSlug?: string;
  project?: ProjectOut;
  requestedComment?: Comment;
  /** Opens the project's Share & access dialog (team members only). */
  onShare?: () => void;
  /** Opens project settings (team members only). */
  onSettings?: () => void;
  /** The team's side panel - the same Details/Comments/MCP/Integrations drawer the website
   * review uses. Guests get the built-in comments drawer instead. */
  renderSidePanel?: (context: AssetSidePanelContext) => ReactNode;
  /** Guests pass the project's review flavour from the share link. */
  variant?: string | null;
  /** The workspace's client branding (guests). */
  branding?: Schemas["PublicBrandingOut"] | null;
}) {
  const online = useOnlineStatus();
  const cache = useQueryClient();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [params, setParams] = useSearchParams();
  const [commentMode, setCommentMode] = useState(true);
  const [draft, setDraft] = useState<api.Region | null>(null);
  const [body, setBody] = useState("");
  const [readyKey, setReadyKey] = useState("");
  const [reply, setReply] = useState("");
  const [tag, setTag] = useState<(typeof TAGS)[number]>("Design");
  const [layer, setLayer] = useState<"client" | "team">("client");
  const [files, setFiles] = useState<Schemas["AttachmentIn"][]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(0);
  const [recording, setRecording] = useState(false);
  const [fileError, setFileError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const [showFiles, setShowFiles] = useState(false);
  // Open beside the file on desktop; on a phone the drawer would cover the file.
  const [guestPanelOpen, setGuestPanelOpen] = useState(() => typeof window === "undefined" || window.innerWidth > 760);
  const [navigationWarning, setNavigationWarning] = useState("");
  const [saveWarning, setSaveWarning] = useState("");
  const [retryLocked, setRetryLocked] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [replyCopyStatus, setReplyCopyStatus] = useState("");
  const [openCommentRequest, setOpenCommentRequest] = useState<{ commentId: string; nonce: number } | null>(null);
  const [revealAfterSave, setRevealAfterSave] = useState<string | null>(null);
  const replying = useRef(false);
  const replyPrepared = useRef<{ commentId: string; body: string; layer: "client" | "team"; id: string } | null>(null);
  const [replyLocked, setReplyLocked] = useState(false);
  const posting = useRef(false);
  const ambiguous = useRef(false);
  const prepared = useRef<{ assetId: string; payload: Parameters<typeof api.createAssetComment>[2] } | null>(null);
  // URL state drives file/page/thread navigation. While a draft or uncertain save
  // exists, keep rendering its original location even if Back/Forward changes URL.
  const locationProtected = Boolean((draft && (body.trim() || files.length || uploadingFiles || recording)) || reply.trim() || retryLocked || replyLocked || posting.current || replying.current);
  const acceptedSearch = useRef(params.toString());
  if (!locationProtected) acceptedSearch.current = params.toString();
  const viewParams = new URLSearchParams(acceptedSearch.current);
  const assetId = viewParams.get("asset") ?? "";
  const page = documentPage(viewParams.get("filePage"));
  const rawFilePage = viewParams.get("filePage");
  // `thread` is the parameter the team's Comments panel reads and writes; `comment` is
  // the legacy deep-link form and is still honoured on the way in.
  const selected = viewParams.get("thread") ?? viewParams.get("comment") ?? "";
  const navigationPending = params.toString() !== acceptedSearch.current;
  const allowedSearch = useRef<string | null>(null);
  const changeLocation = useCallback((file: { id: string; page_id: string }, filePage: number, commentId: string, replace = false) => {
    const next = new URLSearchParams(acceptedSearch.current);
    next.set("asset", file.id);
    next.set("page", file.page_id);
    next.set("filePage", String(filePage));
    next.delete("comment");
    if (commentId) next.set("thread", commentId); else next.delete("thread");
    allowedSearch.current = next.toString();
    setParams(next, { replace });
  }, [setParams]);
  const canComment = Boolean(guest) || projectCan(project, "comment");
  const canEdit = !guest && projectCan(project, "edit");
  const annotationMode = commentMode && canComment;
  const start = useRef<{ x: number; y: number } | null>(null);
  // Neither of these has a WS event backing it (no asset.* upload event, and this
  // screen - unlike BoardPage/ProjectOverviewPage - has no comment.* WS listener of its
  // own), and guests reviewing via a share-link token have no WS connection at all
  // (WSProvider only connects once an authenticated session has a workspace_id). Polling
  // is the only way either side sees the other's new files/comments without a manual
  // refresh, so it stays despite 14-State-Management.md's "no polling for comments"
  // default for the member-only, WS-covered surfaces.
  const assets = useQuery({ queryKey: qk.assetsList(projectId, guest ?? 'member'), queryFn: () => api.listAssets(projectId, guest), refetchInterval: 30000 });
  const fileAccessDenied = accessDenied(assets.error);
  const availableAssets = fileAccessDenied ? undefined : assets.data;
  const requestedPageId = viewParams.get("page");
  const asset = assetId ? availableAssets?.find(a => a.id === assetId) : requestedPageId ? availableAssets?.find(a => a.page_id === requestedPageId) : availableAssets?.[0];
  const isPdf = asset ? asset.content_type === "application/pdf" : project?.project_type === "pdf";
  // Mobile App projects: screens from app builds, shown in a device frame and
  // filterable by build.
  const mobile = (project?.variant ?? variant) === "mobile";
  const builds = mobile ? Array.from(new Set((availableAssets ?? []).map(file => file.build_label ?? ""))) : [];
  const [buildFilter, setBuildFilter] = useState<string | null>(null);
  const tabAssets = mobile && buildFilter !== null ? (availableAssets ?? []).filter(file => (file.build_label ?? "") === buildFilter) : availableAssets;
  const buildLine = (file: api.Asset) => [file.build_label && `Build ${file.build_label}`, file.device, file.platform].filter(Boolean).join(" · ");
  const requestedAnchor = requestedComment?.id === selected ? requestedComment.anchor as { asset_id?: string; region?: api.Region } : undefined;
  const requestedFile = requestedAnchor?.asset_id ? availableAssets?.find(file => file.id === requestedAnchor.asset_id) : undefined;
  const resolvingRequested = Boolean(requestedFile && (assetId !== requestedFile.id || page !== Math.min(requestedFile.page_count, documentPage(String(requestedAnchor?.region?.page_number ?? 1)))));
  useEffect(() => {
    if (!requestedComment || requestedComment.id !== selected || !availableAssets || locationProtected) return;
    const anchor = requestedComment.anchor as { asset_id?: string; region?: api.Region };
    if (!anchor.asset_id) return;
    if (!availableAssets.some(file => file.id === anchor.asset_id)) {
      setNavigationWarning("This comment belongs to an archived or unavailable file. Open Manage files to check it.");
      return;
    }
    const file = availableAssets.find(item => item.id === anchor.asset_id)!;
    if (resolvingRequested) changeLocation(file, Math.min(file.page_count, documentPage(String(anchor.region?.page_number ?? 1))), requestedComment.id, true);
  }, [requestedComment, availableAssets, selected, resolvingRequested, locationProtected, changeLocation]);
  const mediaKey = `${asset?.id}:${page}`;
  const mediaReady = readyKey === mediaKey && !fileAccessDenied;
  const onMediaReady = useCallback((ready: boolean) => setReadyKey(ready ? mediaKey : ""), [mediaKey]);
  const [mediaFailure, setMediaFailure] = useState<string | null>(null);
  useEffect(() => {
    if (locationProtected || resolvingRequested || !asset) return;
    const safePage = Math.min(asset.page_count, page);
    if (!assetId || rawFilePage !== String(safePage) || requestedPageId !== asset.page_id) changeLocation(asset, safePage, selected, true);
  }, [assetId, asset, page, rawFilePage, requestedPageId, selected, resolvingRequested, locationProtected, changeLocation]);
  const commentKey = [...qk.assetComments(asset?.page_id), guest ?? 'member'];
  const comments = useQuery({ queryKey: commentKey, queryFn: () => api.listAssetComments(asset!.page_id, guest), enabled: Boolean(asset), refetchInterval: 10000 });
  const commentAccessDenied = accessDenied(comments.error);
  const visibleComments = commentAccessDenied ? undefined : comments.data;
  // Every thread on this file (all PDF pages), oldest first so the list reads in the
  // order feedback was left; pins are the subset on the page being shown.
  const fileThreads = (visibleComments ?? []).filter((c) => !c.parent_id && regionOf(c)).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const roots = fileThreads.filter((c) => regionOf(c)?.page_number === page);
  const openThreads = fileThreads.filter((c) => !["resolved", "wont_fix"].includes(c.status));
  const selectedComment = fileThreads.find((c) => c.id === selected);
  useEffect(() => {
    if (locationProtected || resolvingRequested || !asset) return;
    const chosen = visibleComments?.find(comment => comment.id === selected);
    if (chosen?.parent_id) { changeLocation(asset, page, chosen.parent_id, true); return; }
    const region = chosen ? regionOf(chosen) : undefined;
    if (region?.page_number && page !== region.page_number) changeLocation(asset, Math.min(asset.page_count, region.page_number), selected, true);
  }, [visibleComments, selected, asset, page, resolvingRequested, locationProtected, changeLocation]);
  function setSelected(commentId: string) { if (asset) changeLocation(asset, page, commentId); }
  function openThread(commentId: string) {
    setSelected(commentId);
    setDraft(null);
    if (guest) setGuestPanelOpen(true);
    else setOpenCommentRequest({ commentId, nonce: Date.now() });
  }
  function goToDocumentPage(nextPage: number) { if (asset && nextPage >= 1 && nextPage <= asset.page_count) { changeLocation(asset, nextPage, ""); setDraft(null); } }
  async function refresh() { await cache.invalidateQueries({ queryKey: qk.assetComments(asset?.page_id) }); if (!guest) { await cache.invalidateQueries({ queryKey: qk.projectComments(projectId) }); } }
  const post = useMutation({
    mutationFn: async () => {
      const submission = prepared.current;
      if (!submission) throw new Error("Choose a location before saving.");
      try { return await api.createAssetComment(projectId, submission.assetId, submission.payload, guest); }
      catch (error) {
        const status = error instanceof Error && "status" in error ? Number(error.status) : 0;
        if (!ambiguous.current && [400, 403, 404, 413, 422].includes(status)) { prepared.current = null; setRetryLocked(false); }
        else { ambiguous.current = true; setRetryLocked(true); }
        throw error;
      }
    },
    onSuccess: comment => {
      if (!mounted.current) return;
      posting.current = false;
      prepared.current = null; ambiguous.current = false; setRetryLocked(false); setBody(""); setDraft(null); setCopyStatus(""); setFiles([]); setFileError("");
      setNavigationWarning("");
      const warn = () => setSaveWarning("Comment saved. Some feedback could not refresh; reload the review to check it.");
      try {
        cache.setQueryData<Comment[]>([...qk.assetComments(comment.page_id), guest ?? 'member'], current => [...(current ?? []).filter(row => row.id !== comment.id), comment]);
        // Opened once the save has settled: while it is in flight the draft guard still
        // holds this location, and a navigation from here would be swallowed.
        if (!navigationBlocked) setRevealAfterSave(comment.id);
      } catch { warn(); }
      void refresh().catch(warn);
    },
    onSettled: () => { posting.current = false; },
  });
  const replyMutation = useMutation({
    mutationFn: async () => {
      const submission = replyPrepared.current;
      if (!submission) throw new Error("Choose a comment before replying.");
      try { return await api.replyToComment(submission.commentId, submission.body, submission.layer, guest, submission.id); }
      catch (error) { setReplyLocked(true); throw error; }
    },
    onSuccess: comment => {
      if (!mounted.current) return;
      replyPrepared.current = null; setReplyLocked(false); setReply(""); setReplyCopyStatus(""); setNavigationWarning("");
      const warn = () => setSaveWarning("Reply saved. Some feedback could not refresh; reload the review to check it.");
      try { cache.setQueryData<Comment[]>([...qk.assetComments(comment.page_id), guest ?? 'member'], current => [...(current ?? []).filter(row => row.id !== comment.id), comment]); } catch { warn(); }
      void refresh().catch(warn);
    },
    onSettled: () => { replying.current = false; },
  });
  function submitComment() {
    if (posting.current || !canComment || !body.trim() || body.trim().length > 10_000 || uploadingFiles > 0 || recording || (!prepared.current && (!asset || !draft || !mediaReady))) return;
    prepared.current ??= { assetId: asset!.id, payload: { body: body.trim(), region: { ...draft! }, layer, tags: [tag], attachments: files, client_request_id: crypto.randomUUID() } };
    posting.current = true; setSaveWarning(""); post.mutate();
  }
  async function addFiles(selected: File[]) {
    if (!selected.length || posting.current || retryLocked) return;
    if (files.length + uploadingFiles + selected.length > 10) { setFileError("A comment can carry up to 10 attachments."); return; }
    setFileError("");
    setUploadingFiles(count => count + selected.length);
    for (const file of selected) {
      try {
        const uploaded = await api.uploadReviewAttachment(projectId, file, guest);
        if (mounted.current) setFiles(current => [...current, uploaded]);
      } catch (error) {
        if (mounted.current) setFileError(error instanceof Error ? error.message : `${file.name} could not be uploaded.`);
      } finally {
        if (mounted.current) setUploadingFiles(count => count - 1);
      }
    }
  }
  function cancelComment() {
    if (recording) return;
    setFiles([]); setFileError("");
    setDraft(null); setBody(""); prepared.current = null; ambiguous.current = false; setRetryLocked(false); setNavigationWarning(""); setCopyStatus("");
  }
  function submitReply() {
    if (replying.current || !canComment || !selectedComment || !reply.trim() || reply.trim().length > 10_000) return;
    replyPrepared.current ??= { commentId: selected, body: reply.trim(), layer: selectedComment.layer, id: crypto.randomUUID() };
    replying.current = true; setSaveWarning(""); replyMutation.mutate();
  }
  const hasDraft = locationProtected || post.isPending || replyMutation.isPending;
  const { blocked: navigationBlocked } = useDraftNavigationGuard({
    name: "file review comment or reply", dirty: locationProtected, pending: post.isPending || replyMutation.isPending,
    unconfirmed: retryLocked || replyLocked,
    discard: () => { prepared.current = null; replyPrepared.current = null; setBody(""); setReply(""); setDraft(null); setRetryLocked(false); setReplyLocked(false); },
    shouldBlock: ({ currentLocation, nextLocation }) => {
    const nextSearch = nextLocation.search.replace(/^\?/, "");
    if (allowedSearch.current !== null) {
      const allowed = currentLocation.pathname === nextLocation.pathname && allowedSearch.current === nextSearch;
      allowedSearch.current = null;
      if (allowed) return false;
    }
    return currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search || currentLocation.hash !== nextLocation.hash;
    },
  });
  const openThreadRef = useRef(openThread);
  openThreadRef.current = openThread;
  useEffect(() => {
    if (!revealAfterSave || hasDraft || !asset) return;
    setRevealAfterSave(null);
    openThreadRef.current(revealAfterSave);
  }, [revealAfterSave, hasDraft, asset]);
  function keepDraft(): boolean {
    if (!hasDraft) return false;
    setNavigationWarning("Save or cancel your comment or reply before changing the file, page or location.");
    return true;
  }
  const reanchorMutation = useMutation({ mutationFn: ({ commentId, region }: { commentId: string, region: api.Region }) => api.reanchorComment(projectId, asset!.id, commentId, region), onSuccess: refresh });
  const [zoomScale, setZoomScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  // Zoom and rotation are CSS transforms on the sheet, which never change its layout
  // box - so the sheet sits inside a frame sized to its *transformed* footprint, and the
  // stage can scroll to every edge of a zoomed or turned file. 100% fits the stage width.
  const stageRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [fitWidth, setFitWidth] = useState<number | null>(null);
  const [sheetSize, setSheetSize] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const styles = getComputedStyle(stage);
      setFitWidth(Math.max(240, stage.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) { setSheetSize(null); return; }
    const measure = () => setSheetSize(current => current && current.width === sheet.offsetWidth && current.height === sheet.offsetHeight ? current : { width: sheet.offsetWidth, height: sheet.offsetHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(sheet);
    return () => observer.disconnect();
  }, [asset?.id]);
  const quarterTurn = Math.abs(rotation % 180) === 90;
  const frameSize = sheetSize ? {
    width: (quarterTurn ? sheetSize.height : sheetSize.width) * zoomScale,
    height: (quarterTurn ? sheetSize.width : sheetSize.height) * zoomScale,
  } : undefined;
  const zoomBy = useCallback((delta: number) => setZoomScale(s => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((s + delta) * 100) / 100))), []);
  const resetView = useCallback(() => { setZoomScale(1); setRotation(0); }, []);
  function selectFile(file: api.Asset) {
    if (file.id === asset?.id || keepDraft()) return;
    changeLocation(file, 1, ""); setDraft(null); resetView();
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target instanceof Element ? e.target : document.activeElement;
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || hasDraft ||
        target?.closest('input, textarea, select, button, a, [contenteditable], [role="dialog"], [role="tablist"], dialog')) return;
      if (e.key === 'Escape' && draft) { setDraft(null); return; }
      if (e.key === '=' || e.key === '+') { zoomBy(ZOOM_STEP); }
      else if (e.key === '-') { zoomBy(-ZOOM_STEP); }
      else if (e.key === '0') { resetView(); }
      else if (e.key === '[') { setRotation(r => (r - 90) % 360); }
      else if (e.key === ']') { setRotation(r => (r + 90) % 360); }
      else if ((e.key === 'c' || e.key === 'C') && canComment) { setCommentMode(true); }
      else if (e.key === 'v' || e.key === 'V') { setCommentMode(false); setDraft(null); }
      else if (e.key === 'ArrowRight' && asset && page < asset.page_count) { e.preventDefault(); changeLocation(asset, page + 1, ""); setDraft(null); }
      else if (e.key === 'ArrowLeft' && asset && page > 1) { e.preventDefault(); changeLocation(asset, page - 1, ""); setDraft(null); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [asset, page, hasDraft, draft, canComment, changeLocation, zoomBy, resetView]);
  // Drag state for moving/resizing existing comments
  const [draggingComment, setDraggingComment] = useState<{ id: string, type: 'move' | 'resize', startRegion: api.Region, startPoint: { x: number, y: number } } | null>(null);
  const [tempRegion, setTempRegion] = useState<{ id: string, region: api.Region } | null>(null);

  function getPoint(clientX: number, clientY: number, container: HTMLElement) {
    const rect = container.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;

    // Rotate back by -rotation
    const rad = -rotation * Math.PI / 180;
    const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ry = dx * Math.sin(rad) + dy * Math.cos(rad);

    // Un-scale and shift origin to top-left of the un-transformed element
    const w = container.offsetWidth;
    const h = container.offsetHeight;

    const x = (rx / zoomScale + w / 2) / w;
    const y = (ry / zoomScale + h / 2) / h;

    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y))
    };
  }

  function handleContainerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!annotationMode || !mediaReady || !asset || post.isPending || (e.target as HTMLElement).closest('button')) return;
    if (keepDraft()) return;
    e.preventDefault();
    start.current = getPoint(e.clientX, e.clientY, e.currentTarget);
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraft({ ...start.current, width: 0, height: 0, page_number: page });
    setSelected("");
  }

  function handleContainerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (draggingComment) {
      const p = getPoint(e.clientX, e.clientY, e.currentTarget);
      const { startRegion, startPoint, type } = draggingComment;
      const dx = p.x - startPoint.x;
      const dy = p.y - startPoint.y;

      const newRegion = { ...startRegion };
      if (type === 'move') {
        newRegion.x = Math.max(0, Math.min(1 - (newRegion.width || 0), startRegion.x + dx));
        newRegion.y = Math.max(0, Math.min(1 - (newRegion.height || 0), startRegion.y + dy));
      } else if (type === 'resize') {
        newRegion.width = Math.max(0, Math.min(1 - newRegion.x, startRegion.width! + dx));
        newRegion.height = Math.max(0, Math.min(1 - newRegion.y, startRegion.height! + dy));
      }
      setTempRegion({ id: draggingComment.id, region: newRegion });
      return;
    }

    if (!start.current) return;
    const p = getPoint(e.clientX, e.clientY, e.currentTarget), s = start.current;
    setDraft({ x: Math.min(s.x,p.x), y: Math.min(s.y,p.y), width: Math.abs(p.x-s.x), height: Math.abs(p.y-s.y), page_number: page });
  }

  function handleContainerUp() {
    if (draggingComment && tempRegion) {
      const moved = JSON.stringify(tempRegion.region) !== JSON.stringify(draggingComment.startRegion);
      if (moved) reanchorMutation.mutate({ commentId: tempRegion.id, region: tempRegion.region });
      else openThread(draggingComment.id);
    }
    setDraggingComment(null);
    setTempRegion(null);
    start.current = null;
  }

  function handleContainerCancel() {
    setDraggingComment(null);
    setTempRegion(null);
    start.current = null;
    setDraft(null);
  }

  // The new-comment card floats beside the draft pin, the same way the website
  // widget's composer opens next to the clicked element. It is positioned from the
  // draft marker's on-screen box, so zoom, rotation and scrolling are all accounted for.
  const draftMarker = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const [composerPosition, setComposerPosition] = useState<{ left: number; top: number } | null>(null);
  const placeComposer = useCallback(() => {
    const marker = draftMarker.current;
    const card = composerRef.current;
    if (!marker || !card) { setComposerPosition(null); return; }
    const anchor = marker.getBoundingClientRect();
    const width = card.offsetWidth || 344;
    const height = card.offsetHeight || 320;
    const gap = 12;
    let left = anchor.right + gap;
    if (left + width > window.innerWidth - gap) left = anchor.left - width - gap;
    left = Math.max(gap, Math.min(left, window.innerWidth - width - gap));
    let top = anchor.top;
    if (top + height > window.innerHeight - gap) top = window.innerHeight - height - gap;
    top = Math.max(gap, top);
    setComposerPosition(current => current && current.left === left && current.top === top ? current : { left, top });
  }, []);
  useLayoutEffect(() => { if (draft && mediaReady) placeComposer(); else setComposerPosition(null); }, [draft, mediaReady, zoomScale, rotation, sheetSize, placeComposer, retryLocked, post.error, copyStatus]);
  // The card mounts hidden until it has been placed, which defeats autoFocus - focus the
  // text box once it is visible, so typing and Esc reach it straight away.
  const composerShown = composerPosition !== null;
  useEffect(() => {
    if (!composerShown) return;
    const card = composerRef.current;
    if (card && !card.contains(document.activeElement)) card.querySelector("textarea")?.focus({ preventScroll: true });
  }, [composerShown]);
  useEffect(() => {
    if (!draft) return;
    window.addEventListener("resize", placeComposer);
    return () => window.removeEventListener("resize", placeComposer);
  }, [draft, placeComposer]);

  function onComposerKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); submitComment(); }
    else if (event.key === "Escape" && !post.isPending) {
      event.preventDefault();
      if (!body.trim() || retryLocked) cancelComment();
      else setNavigationWarning("Press Cancel to discard this comment, or post it.");
    }
  }
  function onReplyKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); submitReply(); }
  }

  const typeLabel = isPdf ? "PDF" : mobile ? "Mobile app" : "Image";
  const sidePanel = renderSidePanel?.({
    currentPageId: asset?.page_id ?? null,
    selectedCommentId: selected || null,
    onRevealComment: (commentId) => { if (!keepDraft() && asset && fileThreads.some(c => c.id === commentId)) changeLocation(asset, page, commentId); },
    openCommentRequest,
  });
  const statusText = !asset ? (assets.isLoading ? "Loading files…" : "No file open")
    : mediaFailure && !mediaReady ? `${asset.filename} couldn't be shown — comments are still available`
    : !mediaReady ? `Loading ${asset.filename}…`
    : draft ? "Write your comment, then post it — or press Esc to cancel"
    : annotationMode ? (canEdit ? "Comment mode — click to pin, drag to select an area, drag a pin to move it" : "Comment mode — click to pin a comment, or drag to select an area")
    : canComment ? "View mode — open a pin to read it. Press C to comment"
    : "View only — your role on this project can't add comments";
  const replies = selectedComment ? (visibleComments ?? []).filter((c) => c.parent_id === selectedComment.id).sort((a, b) => a.created_at.localeCompare(b.created_at)) : [];

  return <main className="bl-review-workspace bl-asset-workspace">
    <header className="bl-review-header">
      <div className="bl-review-identity">
        {workspaceSlug
          ? <Link to={`/w/${workspaceSlug}`} className="bl-review-icon-button" aria-label="Back to all projects" title="All projects" onClick={event => { if (keepDraft()) event.preventDefault(); }}><ArrowLeftIcon /></Link>
          : branding?.logo_url ? <img className="bl-brand-logo" src={branding.logo_url} alt={branding.display_name ?? ""} />
          : <span className="bl-asset-brand" aria-hidden="true">{branding?.display_name ? branding.display_name.slice(0, 1).toUpperCase() : "B"}</span>}
        <div>
          <div className="bl-review-title-line">
            <h1>{title}</h1>
            <span className="bl-review-environment is-file"><i aria-hidden="true" />{typeLabel}</span>
          </div>
          <span className="bl-review-url" title={asset?.filename}>
            <span>{asset ? `${asset.filename}${isPdf ? ` · ${asset.page_count} page${asset.page_count === 1 ? "" : "s"}` : ""}${mobile && buildLine(asset) ? ` · ${buildLine(asset)}` : ""}` : guest ? (guestName ? `Reviewing as ${guestName}` : "Guest review") : "File review"}</span>
          </span>
        </div>
      </div>
      <div className="bl-review-header-tools">
        <div className="bl-review-mode" aria-label="Review mode">
          <button type="button" aria-pressed={!annotationMode} disabled={hasDraft} title="View (V) — read pins without adding new ones" onClick={() => { setCommentMode(false); setDraft(null); }}>
            <PointerIcon width={13} height={13} />View
          </button>
          <button type="button" aria-pressed={annotationMode} disabled={!canComment} title={canComment ? "Comment (C) — click to pin, drag to select an area" : "Your role on this project can't add comments"} onClick={() => setCommentMode(true)}>
            <CommentsIcon width={13} height={13} />Comment
          </button>
        </div>
        {asset && <a className="bl-review-icon-button" href={asset.url} download={asset.filename} target="_blank" rel="noreferrer" aria-label={`Download ${asset.filename}`} title="Download original file"><DownloadIcon /></a>}
        {onShare && <button type="button" className="bl-review-control" onClick={() => { if (!keepDraft()) onShare(); }}><ShareIcon width={13} height={13} />Share</button>}
        {guest && onLeave && <button type="button" className="bl-review-control" onClick={() => { if (!keepDraft()) onLeave(); }}>Leave review</button>}
        <ThemeToggle />
        {project && workspaceSlug && <ProjectMenu project={project} workspaceSlug={workspaceSlug} onShare={onShare} onSettings={onSettings} />}
      </div>
    </header>
    {guest && (
      <div className="bl-guest-bar">
        <span>{guestName ? <>Reviewing <b>{title}</b> as {guestName}</> : <>Reviewing <b>{title}</b> as a guest</>} · your comments and replies are visible to the team</span>
      </div>
    )}
    {!online && (
      <div className="bl-conn-banner offline" role="status" aria-live="polite">
        You are offline. New comments will not be saved until you reconnect.
      </div>
    )}
    <div className="bl-review-pagebar">
      <div className="bl-review-page-tabs" role={availableAssets?.length ? "tablist" : undefined} aria-label={availableAssets?.length ? "Project files" : undefined}>
        {assets.isLoading && <div className="bl-review-tabs-loading" role="status" aria-label="Loading files"><i /><i /><i /></div>}
        {assets.error && !availableAssets && <div className="bl-review-page-error" role="alert"><span>Files unavailable.</span><button type="button" disabled={assets.isFetching} onClick={() => void assets.refetch()}>Retry</button></div>}
        {!assets.isLoading && !assets.error && !availableAssets?.length && <span className="bl-review-page-empty">No files yet.{project ? " Add images or a PDF from Manage files." : " The team has not uploaded a file yet."}</span>}
        {mobile && builds.length > 1 && <select className="bl-asset-build-filter" aria-label="Build" value={buildFilter ?? "__all"} disabled={hasDraft} onChange={(event) => setBuildFilter(event.target.value === "__all" ? null : event.target.value)}>
          <option value="__all">All builds</option>
          {builds.map(label => <option key={label} value={label}>{label ? `Build ${label}` : "No build"}</option>)}
        </select>}
        {tabAssets?.map((file) => (
          <button key={file.id} type="button" role="tab" aria-selected={asset?.id === file.id} title={mobile && buildLine(file) ? `${file.filename} · ${buildLine(file)}` : file.filename} disabled={hasDraft && asset?.id !== file.id} onClick={() => selectFile(file)}>
            <FileGlyph pdf={file.content_type === "application/pdf"} />
            <span>{file.filename}{mobile && file.device ? <small className="bl-asset-tab-meta">{file.device}</small> : null}</span>
            {asset?.id === file.id && <i aria-hidden="true" />}
          </button>
        ))}
      </div>
      {project && <button type="button" className="bl-review-manage-pages" disabled={hasDraft} title={hasDraft ? "Save or cancel your comment first" : undefined} onClick={() => setShowFiles(true)}>Manage files</button>}
    </div>
    {(() => {
      const notices = [
        ...[assets.error && availableAssets ? undefined : assets.error?.message, comments.error && visibleComments ? undefined : comments.error?.message, reanchorMutation.error?.message].filter(Boolean).map((error) => <p key={error} className="bl-error" role="alert">{error}</p>),
        assets.error && availableAssets ? <p key="files-stale" role="status" className="bl-inline-warning">Showing the last loaded files. Changes may be missing until the list refreshes. <button type="button" className="bl-quiet" disabled={assets.isFetching} onClick={() => void assets.refetch()}>Retry files</button></p> : null,
        comments.error && visibleComments ? <div key="comments-stale" role="status" className="bl-inline-warning">Showing the last loaded feedback. Changes may be missing. <button type="button" className="bl-quiet" disabled={comments.isFetching} onClick={() => void comments.refetch()}>{comments.isFetching ? "Checking…" : "Retry comments"}</button></div> : null,
        saveWarning ? <p key="save" role="status" className="bl-inline-warning">{saveWarning}</p> : null,
        navigationWarning ? <p key="nav" role="status" className="bl-inline-warning">{navigationWarning}</p> : null,
        reanchorMutation.isPending ? <p key="reanchor" role="status" className="bl-inline-warning">Saving comment location…</p> : null,
        navigationPending ? <div key="pending" className="bl-inline-warning" role="status">The address changed while this draft was open. Save or cancel it before following the new location. <button type="button" className="bl-quiet" disabled={post.isPending || replyMutation.isPending} onClick={() => setParams(new URLSearchParams(acceptedSearch.current), { replace: true })}>Stay on this file</button></div> : null,
      ].filter(Boolean);
      return notices.length ? <div className="bl-asset-notices">{notices}</div> : null;
    })()}
    <section className="bl-review-main" aria-label="File review canvas">
      <div ref={stageRef} className={`bl-review-stage bl-asset-stage ${annotationMode ? "is-commenting" : "is-browsing"}`} onScroll={draft ? placeComposer : undefined}>
        {asset ? <div className="bl-asset-frame" style={frameSize}><div ref={sheetRef} className={`bl-asset-sheet ${annotationMode ? 'commenting' : ''}${mobile ? ' is-device' : ''}`} style={{ maxWidth: fitWidth ?? undefined, transform: `translate(-50%, -50%) scale(${zoomScale}) rotate(${rotation}deg)` }} onPointerDown={handleContainerDown} onPointerMove={handleContainerMove} onPointerUp={handleContainerUp} onPointerCancel={handleContainerCancel}>
          <AssetPreview key={asset.id} asset={asset} projectId={projectId} pageNumber={page} guest={guest} onReady={onMediaReady} onFailed={setMediaFailure} onManageFiles={project ? () => setShowFiles(true) : undefined} />
          {mediaReady && roots.map((comment) => {
            const region = tempRegion?.id === comment.id ? tempRegion.region : regionOf(comment)!;
            const area = hasArea(region);
            const movable = annotationMode && canEdit && !hasDraft && !reanchorMutation.isPending;
            return (
              <div
                key={comment.id}
                className={`bl-asset-pin-container ${selected === comment.id ? 'selected' : ''} ${area ? 'has-area' : ''} ${["resolved", "wont_fix"].includes(comment.status) ? 'is-closed' : ''}`}
                style={{ left: `${region.x*100}%`, top: `${region.y*100}%`, width: area ? `${region.width!*100}%` : undefined, height: area ? `${region.height!*100}%` : undefined }}
              >
                {area && <div className="bl-asset-pin-border" aria-hidden="true" />}
                <button
                  type="button"
                  className="bl-asset-pin"
                  aria-label={`Comment ${ticketRef(comment)} by ${comment.author_name}: ${comment.body}`}
                  aria-pressed={selected === comment.id}
                  title={`${ticketRef(comment)} · ${comment.author_name}: ${comment.body.slice(0, 80)}`}
                  onClick={(e) => { if (e.detail !== 0 && movable) return; if (keepDraft()) return; openThread(comment.id); }}
                  onPointerDown={(e) => {
                    if (!movable || !mediaReady) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const container = e.currentTarget.closest('.bl-asset-sheet') as HTMLDivElement;
                    container.setPointerCapture(e.pointerId);
                    const startPoint = getPoint(e.clientX, e.clientY, container);
                    setDraggingComment({ id: comment.id, type: 'move', startRegion: region, startPoint });
                    setTempRegion({ id: comment.id, region });
                  }}
                  onKeyDown={(e) => {
                    if (!movable || !mediaReady) return;
                    const step = 0.05;
                    let dx = 0, dy = 0;
                    if (e.key === 'ArrowUp') dy = -step;
                    if (e.key === 'ArrowDown') dy = step;
                    if (e.key === 'ArrowLeft') dx = -step;
                    if (e.key === 'ArrowRight') dx = step;
                    if (dx || dy) {
                      e.preventDefault();
                      e.stopPropagation();
                      const newRegion = {
                        ...region,
                        x: Math.max(0, Math.min(1 - (region.width || 0), region.x + dx)),
                        y: Math.max(0, Math.min(1 - (region.height || 0), region.y + dy)),
                      };
                      reanchorMutation.mutate({ commentId: comment.id, region: newRegion });
                    }
                  }}
                >
                  {pinLabel(comment)}
                </button>
                {area && movable && (
                  <div
                    className="bl-asset-pin-resize-handle"
                    aria-hidden="true"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const container = e.currentTarget.closest('.bl-asset-sheet') as HTMLDivElement;
                      container.setPointerCapture(e.pointerId);
                      const startPoint = getPoint(e.clientX, e.clientY, container);
                      setDraggingComment({ id: comment.id, type: 'resize', startRegion: region, startPoint });
                      setTempRegion({ id: comment.id, region });
                    }}
                  />
                )}
              </div>
            );
          })}
          {mediaReady && draft && <div ref={draftMarker} className={`bl-draft-region ${hasArea(draft) ? 'has-area' : 'is-point'}`} style={{ left: `${draft.x*100}%`, top: `${draft.y*100}%`, width: hasArea(draft) ? `${draft.width!*100}%` : undefined, height: hasArea(draft) ? `${draft.height!*100}%` : undefined }}><span className="bl-asset-pin is-ghost" aria-hidden="true">+</span></div>}
        </div></div> : <div className="bl-review-empty-canvas" role={assets.isLoading ? "status" : undefined}>
          {assets.isLoading ? <span className="bl-review-loader" aria-hidden="true" /> : <span className="bl-review-state-icon"><FileGlyph pdf={Boolean(isPdf)} /></span>}
          <strong>{assets.isLoading ? 'Loading files…' : assets.error ? 'Files unavailable' : assetId || requestedPageId ? 'This file is unavailable' : 'No files yet'}</strong>
          <p>{assets.isLoading ? 'Opening the review files and their comments…' : assetId || requestedPageId ? 'The file may be archived, removed or outside your current review access. Choose another file above or ask the project team.' : guest ? 'The team has not uploaded a file yet.' : 'Add images or a PDF to begin the review.'}</p>
          <div className="bl-review-empty-actions">
            {availableAssets?.length ? <button type="button" className="bl-button" disabled={hasDraft} onClick={() => changeLocation(availableAssets[0], 1, "")}>Open first available file</button> : null}
            {project && !assets.isLoading && <button type="button" className="bl-quiet" onClick={() => setShowFiles(true)}>Manage files</button>}
          </div>
        </div>}
      </div>

      {sidePanel ?? (
        <div className="bl-review-sidepanel">
          {guestPanelOpen && <div className="bl-review-drawer" role="complementary" aria-label="Comments">
            <div className="bl-review-drawer-head">
              <h2 className="text-sm font-semibold">Comments <span className="bl-count">{fileThreads.length}</span></h2>
              <button type="button" onClick={() => setGuestPanelOpen(false)} aria-label="Close panel" className="bl-review-drawer-close">×</button>
            </div>
            <div className="bl-asset-thread-pane">
              {reply.trim() && !selectedComment && <div className="bl-form"><p role="status">The original thread is unavailable. Your reply text is still here; copy it before closing. An unconfirmed reply may already have been saved.</p><textarea className="bl-input" readOnly aria-label="Preserved reply text" value={reply} onFocus={event => event.target.select()} /><button type="button" className="bl-button" disabled={replyMutation.isPending} onClick={() => { setReply(""); replyPrepared.current = null; setReplyLocked(false); setReplyCopyStatus(""); }}>Close reply draft</button></div>}
              {selectedComment ? (
                <div className="bl-asset-thread">
                  <button type="button" className="bl-asset-back" disabled={hasDraft} onClick={() => setSelected('')}>← All comments</button>
                  <article className="bl-asset-thread-root">
                    <header>
                      <Avatar name={selectedComment.author_name} size={26} />
                      <div><strong>{selectedComment.author_name}</strong><time dateTime={selectedComment.created_at}>{formatRelativeTime(selectedComment.created_at)}</time></div>
                      <StatusBadge status={selectedComment.status} />
                    </header>
                    <p>{selectedComment.body}</p>
                    <AttachmentList attachments={selectedComment.attachments} />
                    <div className="bl-chip-row">
                      <span className="bl-chip">{ticketRef(selectedComment)}</span>
                      {isPdf && <span className="bl-chip">Page {regionOf(selectedComment)?.page_number ?? 1}</span>}
                      {(selectedComment.tags ?? []).map(t => <span key={t} className="bl-chip">{t}</span>)}
                    </div>
                  </article>
                  {replies.length > 0 && <ol className="bl-asset-replies">
                    {replies.map((c) => (
                      <li key={c.id}>
                        <header><Avatar name={c.author_name} size={22} /><strong>{c.author_name}</strong><time dateTime={c.created_at}>{formatRelativeTime(c.created_at)}</time>{!guest && <LayerBadge layer={c.layer} />}</header>
                        <p>{c.body}</p>
                        <AttachmentList attachments={c.attachments} />
                      </li>
                    ))}
                  </ol>}
                  {canComment && <form className="bl-asset-reply" onSubmit={(e) => { e.preventDefault(); submitReply(); }}>
                    <textarea className="bl-input" aria-label="Reply" placeholder="Reply to this comment…" rows={3} required maxLength={10_000} readOnly={replyMutation.isPending || replyLocked} value={reply} onKeyDown={onReplyKeyDown} onChange={(e) => { if (!replying.current && !replyLocked) setReply(e.target.value); }} />
                    {replyMutation.error && <p className="bl-error" role="alert">{replyMutation.error.message}</p>}
                    {replyLocked && <p role="status">Saving is unconfirmed. Retry sends the original reply; check saved feedback before starting another reply.</p>}
                    {replyCopyStatus && <p role="status">{replyCopyStatus}</p>}
                    {replyCopyStatus.startsWith("Select") && <textarea className="bl-input" readOnly aria-label="Original reply text to copy" value={reply} onFocus={event => event.target.select()} />}
                    <div className="bl-asset-reply-foot">
                      <span className="bl-cp-hint"><kbd>{isMac ? "⌘" : "Ctrl"}</kbd> <kbd>↵</kbd> to send</span>
                      {replyLocked && <button type="button" className="bl-quiet" disabled={replyMutation.isPending} onClick={() => { if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(reply).then(() => setReplyCopyStatus("Reply text copied.")).catch(() => setReplyCopyStatus("Select the original reply below and copy it manually.")); else setReplyCopyStatus("Select the original reply below and copy it manually."); }}>Copy text</button>}
                      {reply.trim() && <button type="button" className="bl-quiet" disabled={replyMutation.isPending} onClick={() => { setReply(""); replyPrepared.current = null; setReplyLocked(false); setReplyCopyStatus(""); setNavigationWarning(""); }}>{replyLocked ? "Close" : "Cancel"}</button>}
                      <button className="bl-button" disabled={replyMutation.isPending || !reply.trim()}>{replyMutation.isPending ? "Sending…" : replyLocked ? "Retry reply" : "Reply"}</button>
                    </div>
                  </form>}
                </div>
              ) : comments.isPending && asset ? <p className="bl-asset-pane-note" role="status">Loading comments…</p>
                : comments.error && !visibleComments ? <div className="bl-asset-pane-note" role="alert"><p>Saved feedback could not be loaded.</p><button type="button" className="bl-button" disabled={comments.isFetching} onClick={() => void comments.refetch()}>Retry comments</button></div>
                : selected && comments.isSuccess ? <div className="bl-empty"><h2>Comment unavailable</h2><p>This comment may have been removed or is outside your current review access.</p><button type="button" className="bl-button" disabled={hasDraft} onClick={() => setSelected("")}>Show available comments</button></div>
                : fileThreads.length > 0 ? (
                  <ul className="bl-asset-comment-list">
                    {fileThreads.map((c) => {
                      const replyCount = (visibleComments ?? []).filter(r => r.parent_id === c.id).length;
                      const commentPage = regionOf(c)?.page_number ?? 1;
                      return <li key={c.id}>
                        <button type="button" className={`bl-asset-comment ${commentPage !== page ? "is-other-page" : ""}`} onClick={() => { if (keepDraft()) return; openThread(c.id); }}>
                          <span className="bl-asset-comment-pin" style={{ background: STATUS_COLORS[c.status] }}>{pinLabel(c)}</span>
                          <span className="bl-asset-comment-main">
                            <span className="bl-asset-comment-meta"><strong>{c.author_name}</strong><time dateTime={c.created_at}>{formatRelativeTime(c.created_at)}</time></span>
                            <span className="bl-asset-comment-body">{c.body}</span>
                            <span className="bl-chip-row"><StatusBadge status={c.status} />{isPdf && <span className="bl-chip">p.{commentPage}</span>}{replyCount > 0 && <span className="bl-chip">{replyCount} {replyCount === 1 ? "reply" : "replies"}</span>}</span>
                          </span>
                        </button>
                      </li>;
                    })}
                  </ul>
                ) : (
                  <div className="bl-empty bl-asset-pane-empty">
                    <h2>No comments yet</h2>
                    <p>{canComment ? "Click anywhere on the file to pin a comment, or drag to highlight an area." : "Comments on this file will show up here."}</p>
                  </div>
                )}
            </div>
          </div>}
          <nav className="bl-review-panel-rail" aria-label="Review panel">
            <button type="button" onClick={() => setGuestPanelOpen(open => !open)} aria-pressed={guestPanelOpen} aria-label="Comments" className={`bl-review-panel-tab ${guestPanelOpen ? "is-active" : ""}`}>
              <CommentsIcon />
              <span>Comments</span>
            </button>
          </nav>
        </div>
      )}
    </section>

    {draft && mediaReady && (
      <form
        ref={composerRef}
        className="bl-asset-composer"
        role="dialog"
        aria-label="New comment"
        style={composerPosition ? { left: composerPosition.left, top: composerPosition.top } : { visibility: "hidden" }}
        onKeyDown={onComposerKeyDown}
        onSubmit={(e) => { e.preventDefault(); submitComment(); }}
      >
        <div className="bl-asset-composer-head">
          <span className="bl-asset-composer-av" aria-hidden="true">{(guestName ?? "You").trim().slice(0, 2).toUpperCase()}</span>
          <strong>New comment</strong>
          <span className="bl-asset-composer-loc" title={asset?.filename}>{asset?.filename}{isPdf ? ` · p.${draft.page_number}` : ""}</span>
          <button type="button" className="bl-asset-composer-close" aria-label="Cancel comment" disabled={post.isPending} onClick={cancelComment}>×</button>
        </div>
        <fieldset disabled={post.isPending || retryLocked}>
          <textarea className="bl-input" aria-label="Comment" required maxLength={10_000} rows={3} value={body} onChange={(e) => { if (!posting.current && !retryLocked) setBody(e.target.value); }} placeholder="What needs to change here?" />
          <div className="cp-sec">
            <span className="cp-lbl">Tag this as</span>
            <div className="cp-tags" role="group" aria-label="Tag this as">
              {TAGS.map((t) => (
                <button type="button" key={t} className="cp-tag" aria-pressed={tag === t} onClick={() => setTag(t)}>{t}</button>
              ))}
            </div>
          </div>
          {!guest && (
            <div className="cp-sec">
              <span className="cp-lbl">Visibility</span>
              <div className="bl-review-segment bl-asset-visibility" role="group" aria-label="Comment visibility">
                <button type="button" aria-pressed={layer === "client"} onClick={() => setLayer("client")}>Client visible</button>
                <button type="button" aria-pressed={layer === "team"} onClick={() => setLayer("team")}>Team only</button>
              </div>
            </div>
          )}
          <div className="bl-asset-composer-files">
            {files.map((file) => (
              <span key={file.key} className="bl-chip">
                {file.content_type.startsWith("video/") ? "▶ " : file.content_type.startsWith("audio/") ? "♪ " : ""}{file.filename}
                <button type="button" className="bl-cd-chip-x" aria-label={`Remove ${file.filename}`} onClick={() => setFiles(current => current.filter(item => item.key !== file.key))}>×</button>
              </span>
            ))}
            <button type="button" className="bl-cd-shot-add" disabled={uploadingFiles > 0 || recording} onClick={() => fileInput.current?.click()}>
              {uploadingFiles > 0 ? `Uploading ${uploadingFiles}…` : "Attach file"}
            </button>
            <RecordButtons disabled={uploadingFiles > 0} onRecordingChange={setRecording} onRecorded={(file) => void addFiles([file])} />
            <input ref={fileInput} type="file" hidden multiple accept="image/*,application/pdf,video/webm,video/mp4,audio/webm,audio/mp4,audio/ogg" onChange={(event) => { const selected = Array.from(event.target.files ?? []); event.target.value = ""; void addFiles(selected); }} />
          </div>
          {fileError && <p className="bl-error" role="alert">{fileError}</p>}
          <p className="bl-asset-composer-ctx">{hasArea(draft) ? "Area comment" : "Pin comment"} · {typeLabel}{isPdf ? ` page ${draft.page_number}` : ""} · {Math.round(zoomScale * 100)}% zoom</p>
        </fieldset>
        {post.error && <p className="bl-error" role="alert">{post.error.message}</p>}
        {retryLocked && <p role="status" className="bl-asset-composer-note">Saving is unconfirmed. Retry sends the original comment. Check Backline before starting another one.</p>}
        {retryLocked && body.trim() && <button type="button" className="bl-quiet" disabled={post.isPending} onClick={() => { if (navigator.clipboard) void navigator.clipboard.writeText(body).then(() => setCopyStatus("Comment text copied.")).catch(() => setCopyStatus("Select the original text below and copy it manually.")); else setCopyStatus("Select the original text below and copy it manually."); }}>Copy comment text</button>}
        {copyStatus && <p role="status" className="bl-asset-composer-note">{copyStatus}</p>}
        {copyStatus.startsWith("Select") && <textarea className="bl-input" readOnly aria-label="Original comment text to copy" value={body} onFocus={event => event.target.select()} />}
        <div className="cp-foot">
          <span className="bl-cp-hint"><kbd>{isMac ? "⌘" : "Ctrl"}</kbd> <kbd>↵</kbd> to post</span>
          <button className="cp-cancel" type="button" disabled={post.isPending} onClick={cancelComment}>{retryLocked ? "Close" : "Cancel"}</button>
          <button className="cp-post" disabled={post.isPending || !body.trim() || !canComment || uploadingFiles > 0 || recording || (!mediaReady && !retryLocked)}>{post.isPending ? "Saving…" : retryLocked ? "Retry save" : "Post comment"}</button>
        </div>
      </form>
    )}

    <footer className="bl-review-statusbar">
      <div className="bl-review-status-controls">
        <div className="bl-review-zoom" role="group" aria-label="Zoom">
          <button type="button" aria-label="Zoom out (−)" title="Zoom out (−)" disabled={!asset || zoomScale <= ZOOM_MIN} onClick={() => zoomBy(-ZOOM_STEP)}><ZoomOutIcon width={13} height={13} /></button>
          <button type="button" className="bl-review-zoom-value" aria-label="Reset zoom and rotation (0)" title="Reset zoom and rotation (0)" disabled={!asset} onClick={resetView}>{Math.round(zoomScale * 100)}%</button>
          <button type="button" aria-label="Zoom in (+)" title="Zoom in (+)" disabled={!asset || zoomScale >= ZOOM_MAX} onClick={() => zoomBy(ZOOM_STEP)}><ZoomInIcon width={13} height={13} /></button>
        </div>
        <div className="bl-review-segment" role="group" aria-label="Rotate">
          <button type="button" aria-label="Rotate left ([)" title="Rotate left ([)" disabled={!asset} onClick={() => setRotation(r => (r - 90) % 360)}><RotateIcon direction="left" /></button>
          <button type="button" aria-label="Rotate right (])" title="Rotate right (])" disabled={!asset} onClick={() => setRotation(r => (r + 90) % 360)}><RotateIcon direction="right" /></button>
        </div>
        {asset && asset.page_count > 1 && (
          <div className="bl-review-segment bl-asset-pager" role="group" aria-label="PDF pages">
            <button type="button" aria-label="Previous page (←)" title="Previous page (←)" disabled={page <= 1 || hasDraft} onClick={() => goToDocumentPage(page - 1)}>‹</button>
            <select aria-label="PDF page" disabled={hasDraft} value={Math.min(page, asset.page_count)} onChange={event => { if (!keepDraft()) goToDocumentPage(Number(event.target.value)); }}>
              {Array.from({ length: asset.page_count }, (_, index) => <option key={index + 1} value={index + 1}>Page {index + 1} of {asset.page_count}</option>)}
            </select>
            <button type="button" aria-label="Next page (→)" title="Next page (→)" disabled={page >= asset.page_count || hasDraft} onClick={() => goToDocumentPage(page + 1)}>›</button>
          </div>
        )}
        {annotationMode && <button type="button" className="bl-review-control bl-asset-center-pin" disabled={!mediaReady || hasDraft} onClick={() => { setDraft({ x: .5, y: .5, width: 0, height: 0, page_number: page }); setSelected(''); }}>Pin at center</button>}
      </div>
      <span className="bl-review-source-status" role="status">
        <i className={`bl-review-source-dot ${!asset ? "" : mediaReady ? "is-loaded" : mediaFailure ? "is-error" : "is-loading"}`} aria-hidden="true" />
        <span>{statusText}</span>
      </span>
      <div className="bl-review-status-actions">
        <span className="bl-review-comment-count">{fileThreads.length} comment{fileThreads.length === 1 ? "" : "s"} · {openThreads.length} open{isPdf && asset && asset.page_count > 1 ? ` · ${roots.length} on this page` : ""}</span>
      </div>
    </footer>
    {showFiles && project && <ManageFilesDialog project={project} onClose={() => setShowFiles(false)} />}
  </main>;
}
