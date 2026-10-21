import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useDraftNavigationGuard } from "../../lib/draft-navigation";
import { qk } from "../../lib/query-keys";
import { useOnlineStatus } from "../../lib/use-online-status";
import { LayerBadge, StatusBadge } from "@backline/ui";
import { STATUS_COLORS, TAGS } from "../../lib/workflow";
import * as api from "./api";
import type { ProjectOut } from "../projects/api";
import { projectCan } from "../../lib/project-roles";
import { ManageFilesDialog } from "./ManageFilesDialog";
import { AssetPreview } from "./AssetPreview";
import type { Schemas } from "@backline/types";

function documentPage(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 200 ? parsed : 1;
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
}: {
  projectId: string;
  title: string;
  guest?: string;
  guestName?: string;
  onLeave?: () => void;
  workspaceSlug?: string;
  project?: ProjectOut;
  requestedComment?: Schemas["CommentOut"];
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
  const [showFiles, setShowFiles] = useState(false);
  const [navigationWarning, setNavigationWarning] = useState("");
  const [saveWarning, setSaveWarning] = useState("");
  const [retryLocked, setRetryLocked] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [replyCopyStatus, setReplyCopyStatus] = useState("");
  const replying = useRef(false);
  const replyPrepared = useRef<{ commentId: string; body: string; layer: "client" | "team"; id: string } | null>(null);
  const [replyLocked, setReplyLocked] = useState(false);
  const posting = useRef(false);
  const ambiguous = useRef(false);
  const prepared = useRef<{ assetId: string; payload: Parameters<typeof api.createAssetComment>[2] } | null>(null);
  // URL state drives file/page/thread navigation. While a draft or uncertain save
  // exists, keep rendering its original location even if Back/Forward changes URL.
  const locationProtected = Boolean((draft && body.trim()) || reply.trim() || retryLocked || replyLocked || posting.current || replying.current);
  const acceptedSearch = useRef(params.toString());
  if (!locationProtected) acceptedSearch.current = params.toString();
  const viewParams = new URLSearchParams(acceptedSearch.current);
  const assetId = viewParams.get("asset") ?? "";
  const page = documentPage(viewParams.get("filePage"));
  const rawFilePage = viewParams.get("filePage");
  const selected = viewParams.get("thread") ?? viewParams.get("comment") ?? "";
  const navigationPending = params.toString() !== acceptedSearch.current;
  const allowedSearch = useRef<string | null>(null);
  const changeLocation = useCallback((file: { id: string; page_id: string }, filePage: number, commentId: string, replace = false) => {
    const next = new URLSearchParams(acceptedSearch.current);
    next.set("asset", file.id);
    next.set("page", file.page_id);
    next.set("filePage", String(filePage));
    next.delete("thread");
    if (commentId) next.set("comment", commentId); else next.delete("comment");
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
  const requestedPageId = viewParams.get("page");
  const asset = assetId ? assets.data?.find(a => a.id === assetId) : requestedPageId ? assets.data?.find(a => a.page_id === requestedPageId) : assets.data?.[0];
  const requestedAnchor = requestedComment?.id === selected ? requestedComment.anchor as { asset_id?: string; region?: api.Region } : undefined;
  const requestedFile = requestedAnchor?.asset_id ? assets.data?.find(file => file.id === requestedAnchor.asset_id) : undefined;
  const resolvingRequested = Boolean(requestedFile && (assetId !== requestedFile.id || page !== Math.min(requestedFile.page_count, documentPage(String(requestedAnchor?.region?.page_number ?? 1)))));
  useEffect(() => {
    if (!requestedComment || requestedComment.id !== selected || !assets.data || locationProtected) return;
    const anchor = requestedComment.anchor as { asset_id?: string; region?: api.Region };
    if (!anchor.asset_id) return;
    if (!assets.data.some(file => file.id === anchor.asset_id)) {
      setNavigationWarning("This comment belongs to an archived or unavailable file. Open Manage files to check it.");
      return;
    }
    const file = assets.data.find(item => item.id === anchor.asset_id)!;
    if (resolvingRequested) changeLocation(file, Math.min(file.page_count, documentPage(String(anchor.region?.page_number ?? 1))), requestedComment.id, true);
  }, [requestedComment, assets.data, selected, resolvingRequested, locationProtected, changeLocation]);
  const mediaKey = `${asset?.id}:${page}`;
  const mediaReady = readyKey === mediaKey && !assets.error;
  const onMediaReady = useCallback((ready: boolean) => setReadyKey(ready ? mediaKey : ""), [mediaKey]);
  useEffect(() => {
    if (locationProtected || resolvingRequested || !asset) return;
    const safePage = Math.min(asset.page_count, page);
    if (!assetId || rawFilePage !== String(safePage) || requestedPageId !== asset.page_id) changeLocation(asset, safePage, selected, true);
  }, [assetId, asset, page, rawFilePage, requestedPageId, selected, resolvingRequested, locationProtected, changeLocation]);
  const commentKey = [...qk.assetComments(asset?.page_id), guest ?? 'member'];
  const comments = useQuery({ queryKey: commentKey, queryFn: () => api.listAssetComments(asset!.page_id, guest), enabled: Boolean(asset), refetchInterval: 10000 });
  const roots = (comments.data ?? []).filter((c) => !c.parent_id && (c.anchor as { region?: api.Region }).region?.page_number === page);
  const selectedComment = roots.find((c) => c.id === selected);
  useEffect(() => {
    if (locationProtected || resolvingRequested || !asset) return;
    const chosen = comments.data?.find(comment => comment.id === selected);
    if (chosen?.parent_id) { changeLocation(asset, page, chosen.parent_id, true); return; }
    const region = chosen?.anchor as { region?: api.Region } | undefined;
    if (region?.region?.page_number && page !== region.region.page_number) changeLocation(asset, Math.min(asset.page_count, region.region.page_number), selected, true);
  }, [comments.data, selected, asset, page, resolvingRequested, locationProtected, changeLocation]);
  function setSelected(commentId: string) { if (asset) changeLocation(asset, page, commentId); }
  function goToDocumentPage(nextPage: number) { if (asset) { changeLocation(asset, nextPage, ""); setDraft(null); } }
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
      prepared.current = null; ambiguous.current = false; setRetryLocked(false); setBody(""); setDraft(null);
      setNavigationWarning("");
      const warn = () => setSaveWarning("Comment saved. Some feedback could not refresh; reload the review to check it.");
      try {
        cache.setQueryData<Schemas["CommentOut"][]>([...qk.assetComments(comment.page_id), guest ?? 'member'], current => [...(current ?? []).filter(row => row.id !== comment.id), comment]);
        if (!navigationBlocked) setSelected(comment.id);
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
      try { cache.setQueryData<Schemas["CommentOut"][]>([...qk.assetComments(comment.page_id), guest ?? 'member'], current => [...(current ?? []).filter(row => row.id !== comment.id), comment]); } catch { warn(); }
      void refresh().catch(warn);
    },
    onSettled: () => { replying.current = false; },
  });
  function submitComment() {
    if (posting.current || !canComment || !body.trim() || body.trim().length > 10_000 || (!prepared.current && (!asset || !draft || !mediaReady))) return;
    prepared.current ??= { assetId: asset!.id, payload: { body: body.trim(), region: { ...draft! }, layer, tags: [tag], client_request_id: crypto.randomUUID() } };
    posting.current = true; setSaveWarning(""); post.mutate();
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
  function keepDraft(): boolean {
    if (!hasDraft) return false;
    setNavigationWarning("Save or cancel your comment or reply before changing the file, page or location.");
    return true;
  }
  const reanchorMutation = useMutation({ mutationFn: ({ commentId, region }: { commentId: string, region: api.Region }) => api.reanchorComment(projectId, asset!.id, commentId, region), onSuccess: refresh });
  const [zoomScale, setZoomScale] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA' || hasDraft) return;
      if (e.key === '=' || e.key === '+') { setZoomScale(s => Math.min(4, s + 0.25)); }
      else if (e.key === '-') { setZoomScale(s => Math.max(0.25, s - 0.25)); }
      else if (e.key === '[') { setRotation(r => (r - 90) % 360); }
      else if (e.key === ']') { setRotation(r => (r + 90) % 360); }
      else if (e.key === 'ArrowRight' && asset && page < asset.page_count) { e.preventDefault(); changeLocation(asset, page + 1, ""); setDraft(null); }
      else if (e.key === 'ArrowLeft' && asset && page > 1) { e.preventDefault(); changeLocation(asset, page - 1, ""); setDraft(null); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [asset, page, hasDraft, changeLocation]);
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
      reanchorMutation.mutate({ commentId: tempRegion.id, region: tempRegion.region });
      setDraggingComment(null);
      setTempRegion(null);
    }
    start.current = null;
  }

  function handleContainerCancel() {
    setDraggingComment(null);
    setTempRegion(null);
    start.current = null;
    setDraft(null);
  }
  return <main className="bl-review">
    <header className="bl-review-head">{workspaceSlug && <Link className="bl-quiet" onClick={event => { if (keepDraft()) event.preventDefault(); }} to={`/w/${workspaceSlug}`}>← Projects</Link>}<h1>{title}</h1>{workspaceSlug && <Link className="bl-quiet" onClick={event => { if (keepDraft()) event.preventDefault(); }} to={`/w/${workspaceSlug}/p/${projectId}/share-links`}>Share</Link>}<span className="bl-chip">{guest ? 'Guest review' : 'Team workspace'}</span></header>
    {guest && (
      <div className="bl-guest-bar">
        <span>{guestName ? <>Reviewing <b>{title}</b> as {guestName}</> : <>Reviewing <b>{title}</b> as a guest</>} · comments and status changes stay visible to the team</span>
        {onLeave && <button type="button" className="bl-guest-bar-out" onClick={() => { if (!keepDraft()) onLeave(); }}>Leave review</button>}
      </div>
    )}
    {guest && !online && (
      <div className="bl-conn-banner offline" role="status" aria-live="polite">
        You are offline. New comments will not be saved until you reconnect.
      </div>
    )}
    <div className="bl-review-tools"><select className="bl-select" aria-label="Review file" disabled={hasDraft || !assets.data?.length} value={asset?.id ?? ''} onChange={(e) => { const file = assets.data?.find(item => item.id === e.target.value); if (!file || keepDraft()) return; changeLocation(file, 1, ""); setDraft(null); setZoomScale(1); setRotation(0); }}><option value="" disabled>Select a file</option>{assets.data?.map((a) => <option key={a.id} value={a.id}>{a.filename}</option>)}</select>{asset && asset.page_count > 1 && <><button className="bl-quiet" disabled={page === 1 || hasDraft} onClick={() => goToDocumentPage(page - 1)}>Previous page</button><select className="bl-select" aria-label="PDF page" disabled={hasDraft} value={Math.min(page, asset.page_count)} onChange={event => { if (!keepDraft()) goToDocumentPage(Number(event.target.value)); }}>{Array.from({ length: asset.page_count }, (_, index) => <option key={index + 1} value={index + 1}>Page {index + 1} of {asset.page_count}</option>)}</select><button className="bl-quiet" disabled={page === asset.page_count || hasDraft} onClick={() => goToDocumentPage(page + 1)}>Next page</button></>}
      {asset && (
        <div className="bl-segment" style={{ marginLeft: "auto", marginRight: "1rem" }}>
          <button title="Rotate left" onClick={() => setRotation(r => (r - 90) % 360)}>↺</button>
          <button title="Rotate right" onClick={() => setRotation(r => (r + 90) % 360)}>↻</button>
          <button title="Zoom out" onClick={() => setZoomScale(s => Math.max(0.25, s - 0.25))}>-</button>
          <span className="bl-mono" style={{ padding: "0 0.5rem" }}>{Math.round(zoomScale * 100)}%</span>
          <button title="Zoom in" onClick={() => setZoomScale(s => Math.min(4, s + 0.25))}>+</button>
          <button title="Reset" onClick={() => { setZoomScale(1); setRotation(0); }}>Reset</button>
          <a href={asset.url} download={asset.filename} target="_blank" rel="noreferrer" className="bl-quiet ml-2" style={{ textDecoration: 'none' }}>Download</a>
        </div>
      )}
      <div className="bl-segment"><button aria-pressed={!commentMode} disabled={hasDraft} onClick={() => { setCommentMode(false); setDraft(null); }}>View</button><button aria-pressed={commentMode && canComment} disabled={!canComment} onClick={() => setCommentMode(true)}>Comment</button></div>{project && <button type="button" className="bl-quiet" disabled={hasDraft} title={draft && body.trim() ? "Save or cancel your comment first" : undefined} onClick={() => setShowFiles(true)}>Manage files</button>}</div>
    {[assets.error?.message, comments.error?.message, reanchorMutation.error?.message].filter(Boolean).map((error) => <p key={error} className="bl-error" role="alert">{error}</p>)}
    {saveWarning && <p role="status" className="bl-inline-warning">{saveWarning}</p>}
    {assets.error && <button type="button" className="bl-button" disabled={assets.isFetching} onClick={() => void assets.refetch()}>Retry files</button>}
    {navigationPending && <div className="bl-inline-warning" role="status"><p>The address changed while this draft was open. Save or cancel it before following the new location.</p><button type="button" className="bl-quiet" disabled={post.isPending || replyMutation.isPending} onClick={() => setParams(new URLSearchParams(acceptedSearch.current), { replace: true })}>Stay on this file</button></div>}
    <div className="bl-review-body"><section className="bl-asset-stage">{asset ? <><p className="bl-mono">{annotationMode ? (canEdit ? 'Click to pin a comment, drag to select an area, or move an existing pin.' : 'Click to pin a comment, or drag to select an area.') : 'Viewing document'}</p><div className={`bl-asset-sheet ${annotationMode ? 'commenting' : ''}`} style={{ transform: `scale(${zoomScale}) rotate(${rotation}deg)`, transformOrigin: "center center", transition: "transform 0.2s" }} onPointerDown={handleContainerDown} onPointerMove={handleContainerMove} onPointerUp={handleContainerUp} onPointerCancel={handleContainerCancel}>
      <AssetPreview key={asset.id} asset={asset} projectId={projectId} pageNumber={page} guest={guest} onReady={onMediaReady} />
      {mediaReady && roots.map((comment, i) => {
        const region = tempRegion?.id === comment.id ? tempRegion.region : (comment.anchor as unknown as { region: api.Region }).region;
        return (
          <div
            key={comment.id}
            className={`bl-asset-pin-container ${selected === comment.id ? 'selected' : ''}`}
            style={{
              position: 'absolute',
              left: `${region.x*100}%`,
              top: `${region.y*100}%`,
              width: region.width ? `${region.width*100}%` : undefined,
              height: region.height ? `${region.height*100}%` : undefined,
            }}
          >
            <button
              className="bl-asset-pin"
              style={{ borderColor: STATUS_COLORS[comment.status] }}
              aria-label={`Comment ${i+1}: ${comment.body}`}
              onClick={() => { if (keepDraft()) return; setSelected(comment.id); setDraft(null); }}
              onPointerDown={(e) => {
                if (!annotationMode || !canEdit || hasDraft || reanchorMutation.isPending || !mediaReady) return;
                e.preventDefault();
                e.stopPropagation();
                const container = e.currentTarget.closest('.bl-asset-sheet') as HTMLDivElement;
                container.setPointerCapture(e.pointerId);
                const startPoint = getPoint(e.clientX, e.clientY, container);
                setDraggingComment({ id: comment.id, type: 'move', startRegion: region, startPoint });
                setTempRegion({ id: comment.id, region });
              }}
              onKeyDown={(e) => {
                if (!annotationMode || !canEdit || hasDraft || reanchorMutation.isPending || !mediaReady) return;
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
              <span style={{ background: STATUS_COLORS[comment.status] }}>{i+1}</span>
            </button>
            {annotationMode && region.width && region.height && canEdit && !hasDraft && !reanchorMutation.isPending && mediaReady && (
              <div
                className="bl-asset-pin-resize-handle"
                style={{
                  position: 'absolute',
                  right: -5,
                  bottom: -5,
                  width: 10,
                  height: 10,
                  background: 'var(--bl-surface)',
                  border: '1px solid var(--bl-ink)',
                  cursor: 'nwse-resize',
                  zIndex: 10
                }}
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
            {region.width && region.height && (
              <div
                className="bl-asset-pin-border"
                style={{
                  position: 'absolute',
                  inset: 0,
                  border: `2px solid ${STATUS_COLORS[comment.status]}`,
                  pointerEvents: 'none'
                }}
              />
            )}
          </div>
        );
      })}
      {mediaReady && draft && <div className="bl-draft-region" style={{ left: `${draft.x*100}%`, top: `${draft.y*100}%`, width: draft.width ? `${draft.width*100}%` : 20, height: draft.height ? `${draft.height*100}%` : 20 }} />}
    </div><button className="bl-quiet" disabled={!canComment || !mediaReady || hasDraft} onClick={() => { setDraft({ x: .5, y: .5, width: 0, height: 0, page_number: page }); setSelected(''); }}>Add a comment at the center</button></> : <div className="bl-empty"><h2>{assets.isLoading ? 'Loading files…' : assets.error ? 'Files unavailable' : assetId || requestedPageId ? 'This file is unavailable' : 'No files yet'}</h2><p>{assetId || requestedPageId ? 'The file may be archived, removed or outside your current review access. Choose another file above or ask the project team.' : guest ? 'The team has not uploaded a file yet.' : 'Add images or a PDF to begin the review.'}</p>{assets.data?.length ? <button type="button" className="bl-button" disabled={hasDraft} onClick={() => changeLocation(assets.data[0], 1, "")}>Open first available file</button> : null}</div>}</section>
    <aside className="bl-review-comments">
      {navigationWarning && <p role="status" className="bl-inline-warning">{navigationWarning}</p>}
      {reanchorMutation.isPending && <p role="status" className="bl-inline-warning">Saving comment location…</p>}
      <header><h2>Comments <span className="bl-count">{roots.length}</span></h2></header>
      {reply.trim() && !selectedComment && <div className="bl-form"><p role="status">The original thread is unavailable. Your reply text is still here; copy it before closing. An unconfirmed reply may already have been saved.</p><textarea className="bl-input" readOnly aria-label="Preserved reply text" value={reply} onFocus={event => event.target.select()} /><button type="button" className="bl-button" disabled={replyMutation.isPending} onClick={() => { setReply(""); replyPrepared.current = null; setReplyLocked(false); setReplyCopyStatus(""); }}>Close reply draft</button></div>}

      {draft && (
        <form className="cp-body" style={{ padding: "16px", borderBottom: "1px solid var(--bl-line)" }} onSubmit={(e) => { e.preventDefault(); submitComment(); }}>
          <fieldset disabled={post.isPending || retryLocked} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <label className="cp-lbl" style={{ display: "block", marginBottom: "8px", fontWeight: 600 }}>New comment</label>
          <textarea className="bl-input" autoFocus required maxLength={10_000} rows={4} value={body} onChange={(e) => { if (!posting.current && !retryLocked) setBody(e.target.value); }} placeholder="What needs to change here?" />

          <div className="cp-sec">
            <span className="cp-lbl">Tag</span>
            <div className="cp-tags">
              {TAGS.map((t) => (
                <button type="button" key={t} className="cp-tag" aria-pressed={tag === t} onClick={() => setTag(t)}>{t}</button>
              ))}
            </div>
          </div>

          {!guest && (
            <div className="cp-sec">
              <span className="cp-lbl">Visibility</span>
              <select className="bl-select" aria-label="Comment visibility" value={layer} onChange={(e) => setLayer(e.target.value as typeof layer)}>
                <option value="client">Client visible</option>
                <option value="team">Team only</option>
              </select>
            </div>
          )}

          </fieldset>
          {post.error && <p className="bl-error" role="alert">{post.error.message}</p>}
          {retryLocked && <p role="status">Saving is unconfirmed. Retry sends the original comment. Check Backline before starting another one.</p>}
          {body.trim() && <button type="button" className="bl-quiet" disabled={post.isPending} onClick={() => { if (navigator.clipboard) void navigator.clipboard.writeText(body).then(() => setCopyStatus("Comment text copied.")).catch(() => setCopyStatus("Select the original text below and copy it manually.")); else setCopyStatus("Select the original text below and copy it manually."); }}>Copy comment text</button>}
          {copyStatus && <p role="status">{copyStatus}</p>}
          {copyStatus.startsWith("Select") && <textarea className="bl-input" readOnly aria-label="Original comment text to copy" value={body} onFocus={event => event.target.select()} />}

          <div className="cp-foot">
            <button className="cp-cancel" type="button" disabled={post.isPending} onClick={() => { setDraft(null); setBody(""); prepared.current = null; ambiguous.current = false; setRetryLocked(false); setNavigationWarning(""); setCopyStatus(""); }}>{retryLocked ? "Close" : "Cancel"}</button>
            <button className="cp-post" disabled={post.isPending || !body.trim() || !canComment || (!mediaReady && !retryLocked)}>{post.isPending ? "Saving…" : retryLocked ? "Retry save" : "Post comment"}</button>
          </div>
        </form>
      )}

      {selectedComment ? (
        <div className="bl-form" style={{ padding: "16px" }}>
          <button className="bl-quiet" disabled={hasDraft} onClick={() => setSelected('')}>← All comments</button>

          <div className="bl-message" style={{ border: "none", padding: 0, marginTop: "16px" }}>
            <small className="inline-flex items-center gap-2">{selectedComment.author_name} <StatusBadge status={selectedComment.status} /></small>
            <p style={{ margin: "8px 0", fontSize: "14px", lineHeight: 1.5 }}>{selectedComment.body}</p>
            {workspaceSlug && !guest && (
              <Link className="bl-chip" style={{ marginTop: "8px" }} onClick={event => { if (keepDraft()) event.preventDefault(); }} to={`/w/${workspaceSlug}/tickets?comment=${selectedComment.id}`}>Edit status, assignees and due date →</Link>
            )}
          </div>

          {comments.data?.filter((c) => c.parent_id === selected).map((c) => (
            <article className="bl-message" key={c.id}>
              <small className="inline-flex items-center gap-2">{c.author_name} <LayerBadge layer={c.layer} /></small>
              <p>{c.body}</p>
            </article>
          ))}

          <form className="bl-form bl-flush" style={{ marginTop: "16px" }} onSubmit={(e) => { e.preventDefault(); submitReply(); }}>
            <label>Reply
              <textarea className="bl-input" required maxLength={10_000} readOnly={replyMutation.isPending || replyLocked || !canComment} value={reply} onChange={(e) => { if (!replying.current && !replyLocked) setReply(e.target.value); }} />
            </label>
            {replyMutation.error && <p className="bl-error" role="alert">{replyMutation.error.message}</p>}
            {replyLocked && <p role="status">Saving is unconfirmed. Retry sends the original reply; check saved feedback before starting another reply.</p>}
            <button className="bl-button" disabled={replyMutation.isPending || !reply.trim() || !canComment}>{replyMutation.isPending ? "Saving…" : replyLocked ? "Retry reply" : "Post reply"}</button>
            {reply.trim() && <button type="button" className="bl-quiet" disabled={replyMutation.isPending} onClick={() => { if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(reply).then(() => setReplyCopyStatus("Reply text copied.")).catch(() => setReplyCopyStatus("Select the original reply below and copy it manually.")); else setReplyCopyStatus("Select the original reply below and copy it manually."); }}>Copy reply text</button>}
            {replyCopyStatus && <p role="status">{replyCopyStatus}</p>}
            {replyCopyStatus.startsWith("Select") && <textarea className="bl-input" readOnly aria-label="Original reply text to copy" value={reply} onFocus={event => event.target.select()} />}
            {reply.trim() && <button type="button" className="bl-quiet" disabled={replyMutation.isPending} onClick={() => { setReply(""); replyPrepared.current = null; setReplyLocked(false); setReplyCopyStatus(""); setNavigationWarning(""); }}>{replyLocked ? "Close reply" : "Cancel reply"}</button>}
          </form>
        </div>
      ) : (
        comments.isPending && asset ? <p role="status">Loading comments…</p> : comments.error ? <div role="alert"><p>Saved feedback could not be loaded.</p><button type="button" className="bl-button" disabled={comments.isFetching} onClick={() => void comments.refetch()}>Retry comments</button></div> : selected && comments.isSuccess ? <div className="bl-empty"><h2>Comment unavailable</h2><p>This comment may have been removed or is outside your current review access.</p><button type="button" className="bl-button" disabled={hasDraft} onClick={() => setSelected("")}>Show available comments</button></div> : roots.length > 0 ? (
          roots.map((c, i) => (
            <button className="bl-review-comment" key={c.id} onClick={() => { if (keepDraft()) return; setSelected(c.id); setDraft(null); }}>
              <small className="inline-flex items-center gap-2">#{i+1} · {c.author_name} <StatusBadge status={c.status} /></small>
              <p>{c.body}</p>
              <div className="bl-chip-row" style={{ marginTop: "8px" }}>
                <LayerBadge layer={c.layer} />
              </div>
            </button>
          ))
        ) : (
          <div className="bl-empty" style={{ marginTop: "32px" }}>
            <h2>No comments</h2>
            <p>Click on the asset to start a conversation.</p>
          </div>
        )
      )}
    </aside></div>
    {showFiles && project && <ManageFilesDialog project={project} onClose={() => setShowFiles(false)} />}
  </main>;
}
