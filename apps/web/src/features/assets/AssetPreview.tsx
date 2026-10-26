import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { ApiError } from "../../lib/api-client";
import { qk } from "../../lib/query-keys";
import { getAssetContent, type Asset } from "./api";

export function AssetPreview({ asset, projectId, pageNumber, guest, onReady, onFailed, onManageFiles }: {
  asset: Asset; projectId: string; pageNumber: number; guest?: string; onReady: (ready: boolean) => void;
  /** The file couldn't be shown (message), or is loading/shown again (null). */
  onFailed?: (message: string | null) => void;
  /** Offered when the stored file is gone, for people who can replace it. */
  onManageFiles?: () => void;
}) {
  const content = useQuery({
    queryKey: qk.assetContent(projectId, asset.id, guest ?? "member"),
    queryFn: ({ signal }) => getAssetContent(projectId, asset.id, guest, signal),
    staleTime: Infinity, gcTime: 60000, refetchOnWindowFocus: false,
  });
  const [imageUrl, setImageUrl] = useState("");
  const [imageError, setImageError] = useState(false);
  useEffect(() => {
    onReady(false);
    setImageError(false);
    if (!content.data || asset.content_type === "application/pdf") { setImageUrl(""); return; }
    const url = URL.createObjectURL(content.data);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [content.data, asset.content_type, onReady]);

  const failure = content.error ? content.error.message : imageError ? "This image could not be displayed." : null;
  useEffect(() => { onFailed?.(failure); }, [failure, onFailed]);
  if (content.isLoading) return <div className="bl-asset-loading" role="status">Loading {asset.filename}…</div>;
  if (failure) {
    const missing = content.error instanceof ApiError && content.error.code === "FILE_MISSING";
    return <div className="bl-asset-loading" role="alert">
      <p>{!missing ? failure
        // A client reviewer can't replace files, so they're pointed at the team instead.
        : guest ? `${asset.filename} isn't available right now. Let the team know so they can upload it again; comments stay in the Comments panel.`
        : `${asset.filename} is missing from storage. Upload it again from Manage files; its comments stay in the Comments panel.`}</p>
      <div className="bl-asset-loading-actions">
        {missing && onManageFiles && <button type="button" className="bl-button" onClick={onManageFiles}>Manage files</button>}
        <button type="button" className={missing && onManageFiles ? "bl-quiet" : "bl-button"} onClick={() => { onReady(false); setImageError(false); void content.refetch(); }}>Retry file</button>
      </div>
    </div>;
  }
  if (!content.data) return null;
  if (asset.content_type === "application/pdf") return <PdfCanvas blob={content.data} pageNumber={pageNumber} onReady={onReady} />;
  return imageUrl ? <img draggable={false} src={imageUrl} alt={asset.filename} onLoad={() => onReady(true)} onError={() => { onReady(false); setImageError(true); }} /> : null;
}

function PdfCanvas({ blob, pageNumber, onReady }: { blob: Blob; pageNumber: number; onReady: (ready: boolean) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [renderedPage, setRenderedPage] = useState<number | null>(null);
  const renderPending = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | undefined;
    const timeout = window.setTimeout(() => {
      if (cancelled) return;
      cancelled = true;
      setError("Preparing this PDF took too long. Retry PDF to start again.");
      if (task) void task.destroy().catch(() => undefined);
    }, 30_000);
    setDocument(null);
    setError("");
    // Download the PDF parser only when a reviewer actually opens a PDF. Image
    // review and website sign-in never need this large engine module.
    void Promise.all([import("pdfjs-dist"), blob.arrayBuffer()]).then(([pdfjs, data]) => {
      if (cancelled) return;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      task = pdfjs.getDocument({ data: new Uint8Array(data) });
      return task.promise.then(pdf => { if (!cancelled) setDocument(pdf); });
    }).catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "PDF could not be read."); })
      .finally(() => window.clearTimeout(timeout));
    return () => { cancelled = true; window.clearTimeout(timeout); if (task) void task.destroy().catch(() => undefined); };
  }, [blob, retry]);

  useEffect(() => {
    let cancelled = false;
    let render: RenderTask | undefined;
    onReady(false);
    setRenderedPage(null);
    if (!document) return;
    setError("");
    // Includes waiting for a previous cancelled render and page parsing. Never
    // leave the reviewer on an indefinite loading state if the worker stalls.
    const timeout = window.setTimeout(() => {
      if (cancelled) return;
      cancelled = true;
      render?.cancel();
      onReady(false);
      setError(`Rendering PDF page ${pageNumber} took too long. Retry PDF to start again.`);
    }, 30_000);
    void document.getPage(pageNumber).then(async page => {
      await renderPending.current.catch(() => undefined);
      if (cancelled || !canvas.current) return;
      // Bound pixel memory even for a PDF with unusually large physical dimensions.
      const natural = page.getViewport({ scale: 1 });
      if (!Number.isFinite(natural.width) || !Number.isFinite(natural.height) || natural.width <= 0 || natural.height <= 0) throw new Error("This PDF page has invalid dimensions and cannot be displayed.");
      const scale = Math.min(1.5, 4096 / Math.max(natural.width, natural.height), Math.sqrt(8_000_000 / (natural.width * natural.height)));
      const viewport = page.getViewport({ scale });
      const context = canvas.current.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable.");
      canvas.current.width = Math.max(1, Math.floor(viewport.width));
      canvas.current.height = Math.max(1, Math.floor(viewport.height));
      render = page.render({ canvas: canvas.current, canvasContext: context, viewport });
      renderPending.current = render.promise;
      await renderPending.current;
      if (!cancelled) { setRenderedPage(pageNumber); onReady(true); }
    }).catch((e: unknown) => { if (!cancelled) { onReady(false); setError(e instanceof Error ? e.message : "PDF could not be rendered."); } })
      .finally(() => window.clearTimeout(timeout));
    return () => { cancelled = true; window.clearTimeout(timeout); render?.cancel(); };
  }, [document, pageNumber, onReady]);
  return <>
    {renderedPage !== pageNumber && !error && <div className="bl-asset-loading" role="status">{document ? `Rendering PDF page ${pageNumber}…` : "Preparing PDF…"}</div>}
    {error && <div className="bl-asset-loading" role="alert"><p>{error}</p><button type="button" className="bl-button" onClick={() => { onReady(false); setRetry(value => value + 1); }}>Retry PDF</button></div>}
    <canvas ref={canvas} aria-label={`PDF page ${pageNumber}`} hidden={Boolean(error) || !document || renderedPage !== pageNumber} />
  </>;
}
