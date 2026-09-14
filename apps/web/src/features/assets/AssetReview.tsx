import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { qk } from "../../lib/query-keys";
import { useOnlineStatus } from "../../lib/use-online-status";
import { LayerBadge, StatusBadge } from "@backline/ui";
import { STATUS_COLORS, TAGS } from "../../lib/workflow";
import * as api from "./api";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export function AssetReview({
  projectId,
  title,
  guest,
  guestName,
  onLeave,
  workspaceSlug,
}: {
  projectId: string;
  title: string;
  guest?: string;
  guestName?: string;
  onLeave?: () => void;
  workspaceSlug?: string;
}) {
  const online = useOnlineStatus();
  const cache = useQueryClient();
  const [assetId, setAssetId] = useState("");
  const [page, setPage] = useState(1);
  const [commentMode, setCommentMode] = useState(true);
  const [draft, setDraft] = useState<api.Region | null>(null);
  const [body, setBody] = useState("");
  const [selected, setSelected] = useState("");
  const [reply, setReply] = useState("");
  const [tag, setTag] = useState<(typeof TAGS)[number]>("Design");
  const [layer, setLayer] = useState<"client" | "team">("client");
  const start = useRef<{ x: number; y: number } | null>(null);
  // Neither of these has a WS event backing it (no asset.* upload event, and this
  // screen - unlike BoardPage/ProjectOverviewPage - has no comment.* WS listener of its
  // own), and guests reviewing via a share-link token have no WS connection at all
  // (WSProvider only connects once an authenticated session has a workspace_id). Polling
  // is the only way either side sees the other's new files/comments without a manual
  // refresh, so it stays despite 14-State-Management.md's "no polling for comments"
  // default for the member-only, WS-covered surfaces.
  const assets = useQuery({ queryKey: qk.assetsList(projectId, guest ?? 'member'), queryFn: () => api.listAssets(projectId, guest), refetchInterval: 30000 });
  const asset = assets.data?.find((a) => a.id === assetId) ?? assets.data?.[0];
  const commentKey = [...qk.assetComments(asset?.page_id), guest ?? 'member'];
  const comments = useQuery({ queryKey: commentKey, queryFn: () => api.listAssetComments(asset!.page_id, guest), enabled: Boolean(asset), refetchInterval: 10000 });
  const roots = (comments.data ?? []).filter((c) => !c.parent_id && (c.anchor as { region?: api.Region }).region?.page_number === page);
  const selectedComment = roots.find((c) => c.id === selected);
  async function refresh() { await cache.invalidateQueries({ queryKey: qk.assetComments(asset?.page_id) }); if (!guest) { await cache.invalidateQueries({ queryKey: qk.projectComments(projectId) }); } }
  const post = useMutation({ mutationFn: () => api.createAssetComment(projectId, asset!.id, { body: body.trim(), region: draft!, tags: [tag], layer }, guest), onSuccess: async (comment) => { setBody(""); setDraft(null); setSelected(comment.id); await refresh(); } });
  const replyMutation = useMutation({ mutationFn: () => api.replyToComment(selected, reply.trim(), selectedComment?.layer ?? 'client', guest), onSuccess: async () => { setReply(""); await refresh(); } });
  const reanchorMutation = useMutation({ mutationFn: ({ commentId, region }: { commentId: string, region: api.Region }) => api.reanchorComment(commentId, { region }), onSuccess: refresh });
  const upload = useMutation({ mutationFn: async (files: FileList) => { for (const file of Array.from(files)) await api.uploadAsset(projectId, file); }, onSettled: () => cache.invalidateQueries({ queryKey: qk.assets(projectId) }) });
  const [zoomScale, setZoomScale] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      if (e.key === '=' || e.key === '+') { setZoomScale(s => Math.min(4, s + 0.25)); }
      else if (e.key === '-') { setZoomScale(s => Math.max(0.25, s - 0.25)); }
      else if (e.key === '[') { setRotation(r => (r - 90) % 360); }
      else if (e.key === ']') { setRotation(r => (r + 90) % 360); }
      else if (e.key === 'ArrowRight' && asset && page < asset.page_count) { setPage(p => p + 1); setDraft(null); setSelected(''); }
      else if (e.key === 'ArrowLeft' && asset && page > 1) { setPage(p => p - 1); setDraft(null); setSelected(''); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [asset, page]);
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
    if (!commentMode || !asset || (e.target as HTMLElement).closest('button')) return; 
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
    <header className="bl-review-head">{workspaceSlug && <Link className="bl-quiet" to={`/w/${workspaceSlug}`}>← Projects</Link>}<h1>{title}</h1>{workspaceSlug && <Link className="bl-quiet" to={`/w/${workspaceSlug}/p/${projectId}/share-links`}>Share</Link>}<span className="bl-chip">{guest ? 'Guest review' : 'Team workspace'}</span></header>
    {guest && (
      <div className="bl-guest-bar">
        <span>{guestName ? <>Reviewing <b>{title}</b> as {guestName}</> : <>Reviewing <b>{title}</b> as a guest</>} · comments and status changes stay visible to the team</span>
        {onLeave && <button type="button" className="bl-guest-bar-out" onClick={onLeave}>Leave review</button>}
      </div>
    )}
    {guest && !online && (
      <div className="bl-conn-banner offline" role="status" aria-live="polite">
        You are offline. New comments will not be saved until you reconnect.
      </div>
    )}
    <div className="bl-review-tools"><select className="bl-select" aria-label="Review file" value={asset?.id ?? ''} onChange={(e) => { setAssetId(e.target.value); setPage(1); setDraft(null); setSelected(''); setZoomScale(1); setRotation(0); }}>{assets.data?.map((a) => <option key={a.id} value={a.id}>{a.filename}</option>)}</select>{asset && asset.page_count > 1 && <><button className="bl-quiet" disabled={page === 1} onClick={() => { setPage(page - 1); setDraft(null); setSelected(''); }}>Previous page</button><span className="bl-mono">{page} / {asset.page_count}</span><button className="bl-quiet" disabled={page === asset.page_count} onClick={() => { setPage(page + 1); setDraft(null); setSelected(''); }}>Next page</button></>}
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
      <div className="bl-segment"><button aria-pressed={!commentMode} onClick={() => { setCommentMode(false); setDraft(null); }}>View</button><button aria-pressed={commentMode} onClick={() => setCommentMode(true)}>Comment</button></div>{!guest && <label className="bl-quiet">{upload.isPending ? "Uploading…" : "Add files"}<input type="file" aria-label="Add project files" disabled={upload.isPending} multiple hidden accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" onChange={(e) => { if (e.target.files) upload.mutate(e.target.files); }} /></label>}</div>
    {[assets.error?.message, comments.error?.message, upload.error?.message].filter(Boolean).map((error) => <p key={error} className="bl-error" role="alert">{error}</p>)}
    <div className="bl-review-body"><section className="bl-asset-stage">{asset ? <><p className="bl-mono">{commentMode ? 'Click to pin a comment, or drag to select a region. Drag existing pins to move them.' : 'Viewing document'}</p><div className={`bl-asset-sheet ${commentMode ? 'commenting' : ''}`} style={{ transform: `scale(${zoomScale}) rotate(${rotation}deg)`, transformOrigin: "center center", transition: "transform 0.2s" }} onPointerDown={handleContainerDown} onPointerMove={handleContainerMove} onPointerUp={handleContainerUp} onPointerCancel={handleContainerCancel}>
      {asset.content_type === 'application/pdf' ? <PdfCanvas url={asset.url} pageNumber={page} /> : <img draggable={false} src={asset.url} alt={asset.filename} />}
      {roots.map((comment, i) => { 
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
              onClick={() => { setSelected(comment.id); setDraft(null); }}
              onPointerDown={(e) => {
                if (!commentMode || guest) return;
                e.preventDefault();
                e.stopPropagation();
                const container = e.currentTarget.closest('.bl-asset-sheet') as HTMLDivElement;
                container.setPointerCapture(e.pointerId);
                const startPoint = getPoint(e.clientX, e.clientY, container);
                setDraggingComment({ id: comment.id, type: 'move', startRegion: region, startPoint });
                setTempRegion({ id: comment.id, region });
              }}
              onKeyDown={(e) => {
                if (!commentMode || guest) return;
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
            {commentMode && region.width && region.height && !guest && (
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
      {draft && <div className="bl-draft-region" style={{ left: `${draft.x*100}%`, top: `${draft.y*100}%`, width: draft.width ? `${draft.width*100}%` : 20, height: draft.height ? `${draft.height*100}%` : 20 }} />}
    </div><button className="bl-quiet" onClick={() => { setDraft({ x: .5, y: .5, width: 0, height: 0, page_number: page }); setSelected(''); }}>Add a comment at the center</button></> : <div className="bl-empty"><h2>{assets.isLoading ? 'Loading files…' : 'No files yet'}</h2><p>{guest ? 'The team has not uploaded a file yet.' : 'Add images or a PDF to begin the review.'}</p></div>}</section>
    <aside className="bl-review-comments">
      <header><h2>Comments <span className="bl-count">{roots.length}</span></h2></header>
      
      {draft && (
        <form className="cp-body" style={{ padding: "16px", borderBottom: "1px solid var(--bl-line)" }} onSubmit={(e) => { e.preventDefault(); post.mutate(); }}>
          <label className="cp-lbl" style={{ display: "block", marginBottom: "8px", fontWeight: 600 }}>New comment</label>
          <textarea className="bl-input" autoFocus required rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What needs to change here?" />
          
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
          
          {post.error && <p className="bl-error" role="alert">{post.error.message}</p>}
          
          <div className="cp-foot">
            <button className="cp-cancel" type="button" onClick={() => setDraft(null)}>Cancel</button>
            <button className="cp-post" disabled={post.isPending || !body.trim()}>Post comment</button>
          </div>
        </form>
      )}

      {selectedComment ? (
        <div className="bl-form" style={{ padding: "16px" }}>
          <button className="bl-quiet" onClick={() => setSelected('')}>← All comments</button>
          
          <div className="bl-message" style={{ border: "none", padding: 0, marginTop: "16px" }}>
            <small className="inline-flex items-center gap-2">{selectedComment.author_name} <StatusBadge status={selectedComment.status} /></small>
            <p style={{ margin: "8px 0", fontSize: "14px", lineHeight: 1.5 }}>{selectedComment.body}</p>
            {workspaceSlug && !guest && (
              <Link className="bl-chip" style={{ marginTop: "8px" }} to={`/w/${workspaceSlug}/tickets?ticket=${selectedComment.id}`}>Edit status, assignees and due date →</Link>
            )}
          </div>

          {comments.data?.filter((c) => c.parent_id === selected).map((c) => (
            <article className="bl-message" key={c.id}>
              <small className="inline-flex items-center gap-2">{c.author_name} <LayerBadge layer={c.layer} /></small>
              <p>{c.body}</p>
            </article>
          ))}

          <form className="bl-form bl-flush" style={{ marginTop: "16px" }} onSubmit={(e) => { e.preventDefault(); replyMutation.mutate(); }}>
            <label>Reply
              <textarea className="bl-input" required value={reply} onChange={(e) => setReply(e.target.value)} />
            </label>
            {replyMutation.error && <p className="bl-error" role="alert">{replyMutation.error.message}</p>}
            <button className="bl-button" disabled={replyMutation.isPending || !reply.trim()}>Post reply</button>
          </form>
        </div>
      ) : (
        roots.length > 0 ? (
          roots.map((c, i) => (
            <button className="bl-review-comment" key={c.id} onClick={() => { setSelected(c.id); setDraft(null); }}>
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
  </main>;
}

function PdfCanvas({ url, pageNumber }: { url: string; pageNumber: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    let render: pdfjs.RenderTask | undefined;
    const task = pdfjs.getDocument({ url });
    setError('');
    void task.promise.then(async (document) => {
      const page = await document.getPage(pageNumber);
      if (cancelled || !canvas.current) return;
      const viewport = page.getViewport({ scale: 1.5 });
      canvas.current.width = viewport.width; canvas.current.height = viewport.height;
      const context = canvas.current.getContext('2d');
      if (!context) throw new Error('Canvas is unavailable.');
      render = page.render({ canvas: canvas.current, canvasContext: context, viewport });
      await render.promise;
    }).catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'PDF could not be rendered.'); });
    return () => { cancelled = true; render?.cancel(); void task.destroy(); };
  }, [url, pageNumber]);
  return <>{error && <p role="alert" className="bl-error">{error}</p>}<canvas ref={canvas} aria-label={`PDF page ${pageNumber}`} /></>;
}
