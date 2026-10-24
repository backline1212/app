import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Dialog } from "../../components/Dialog";
import { useToast } from "../../components/Toast";
import { qk } from "../../lib/query-keys";
import { redactReviewUrl } from "../../lib/review-page-path";
import type { ProjectOut } from "./api";
import * as api from "./api";

interface ProjectPagesModalProps {
  project: ProjectOut;
  activePageId: string | null;
  onClose: () => void;
  onOpenPage: (pageId: string) => void;
}

function PageIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z" /><path d="M14 2v5h5" /></svg>;
}

export function ProjectPagesModal({ project, activePageId, onClose, onOpenPage }: ProjectPagesModalProps) {
  const cache = useQueryClient();
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [removeTarget, setRemoveTarget] = useState<api.PageOut | null>(null);
  const queryKey = qk.projectPages(project.id);

  const pagesQuery = useQuery({ queryKey, queryFn: ({ signal }) => api.listPages(project.id, signal) });
  const createPage = useMutation({
    mutationFn: () => api.createPage(project.id, { url: newUrl.trim(), title: newTitle.trim() || null }),
    onSuccess: async (page) => { setNewTitle(""); setNewUrl(""); await cache.invalidateQueries({ queryKey }); toast("Page added."); onOpenPage(page.id); },
  });
  const updatePage = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => api.updatePage(id, { title: title.trim() || null }),
    onSuccess: async () => { setEditingId(null); await cache.invalidateQueries({ queryKey }); toast("Page renamed."); },
  });
  const reorderPages = useMutation({
    mutationFn: (pageIds: string[]) => api.reorderPages(project.id, pageIds),
    onSuccess: (pages) => { cache.setQueryData(queryKey, pages); toast("Page order updated."); },
  });
  const removePage = useMutation({
    mutationFn: (pageId: string) => api.removePage(pageId),
    onSuccess: async (_, pageId) => { setRemoveTarget(null); await cache.invalidateQueries({ queryKey }); if (activePageId === pageId) onOpenPage(""); toast("Empty page removed."); },
  });

  const pages = pagesQuery.data ?? [];
  const mutationError = createPage.error ?? updatePage.error ?? reorderPages.error;

  function movePage(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= pages.length) return;
    const next = pages.map((page) => page.id);
    [next[index], next[destination]] = [next[destination], next[index]];
    reorderPages.mutate(next);
  }

  return (
    <>
      <Dialog title="Manage pages" onClose={onClose}>
        <div className="bl-dialog-intro"><p>{project.name}</p></div>
        <div className="bl-pages-body">
          <p className="bl-pages-lead">Pin website pages to this project, rename them for your team, and set their review order. Reviewer visits can still register linked pages automatically.</p>
          <form className="bl-add-page" onSubmit={(event) => { event.preventDefault(); createPage.mutate(); }}>
            <label><span>Page URL <em>Required</em></span><input className="bl-input" type="url" required value={newUrl} maxLength={2000} onChange={(event) => setNewUrl(event.target.value)} placeholder={`${project.target_origin.replace(/\/$/, "")}/pricing`} /></label>
            <label><span>Display name <em>Optional</em></span><input className="bl-input" value={newTitle} maxLength={500} onChange={(event) => setNewTitle(event.target.value)} placeholder="Pricing" /></label>
            <button className="bl-button mint" disabled={createPage.isPending || !newUrl.trim()}>{createPage.isPending ? "Adding…" : "Add page"}</button>
          </form>

          {mutationError && <p role="alert" className="bl-error">{mutationError.message}</p>}
          {pagesQuery.isLoading ? (
            <div className="bl-page-list" aria-label="Loading pages"><div className="bl-page-skeleton" /><div className="bl-page-skeleton" /><div className="bl-page-skeleton" /></div>
          ) : pagesQuery.isError ? (
            <div className="bl-state-panel" role="alert"><PageIcon /><h3>Pages could not load</h3><p>{pagesQuery.error.message}</p><button type="button" className="bl-quiet" onClick={() => pagesQuery.refetch()}>Try again</button></div>
          ) : pages.length === 0 ? (
            <div className="bl-state-panel"><PageIcon /><h3>No pages registered</h3><p>Add the first URL above. It will become the active preview selection.</p></div>
          ) : (
            <ol className="bl-page-list">
              {pages.map((page, index) => (
                <li key={page.id} className={activePageId === page.id ? "is-active" : ""}>
                  <span className="bl-page-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="bl-page-file"><PageIcon /></span>
                  {editingId === page.id ? (
                    <form className="bl-page-rename" onSubmit={(event) => { event.preventDefault(); updatePage.mutate({ id: page.id, title: editTitle }); }}>
                      <label className="sr-only" htmlFor={`page-title-${page.id}`}>Page display name</label>
                      <input id={`page-title-${page.id}`} className="bl-input" value={editTitle} maxLength={500} onChange={(event) => setEditTitle(event.target.value)} placeholder={redactReviewUrl(page.url_normalized)} autoFocus />
                      <button className="bl-button" disabled={updatePage.isPending}>Save</button><button type="button" className="bl-quiet" onClick={() => setEditingId(null)}>Cancel</button>
                    </form>
                  ) : <>
                    <button type="button" className="bl-page-main" aria-current={activePageId === page.id ? "page" : undefined} onClick={() => onOpenPage(page.id)}><strong>{page.title || redactReviewUrl(page.url_normalized)}</strong><small>{redactReviewUrl(page.url_normalized)}</small></button>
                    <span className="bl-page-comments">{page.comment_count ? `${page.comment_count} comment${page.comment_count === 1 ? "" : "s"}` : "Clear"}</span>
                    <div className="bl-page-actions">
                      <button type="button" className="bl-icon-button" aria-label={`Move ${page.title || redactReviewUrl(page.url_normalized)} up`} disabled={index === 0 || reorderPages.isPending} onClick={() => movePage(index, -1)}>↑</button>
                      <button type="button" className="bl-icon-button" aria-label={`Move ${page.title || redactReviewUrl(page.url_normalized)} down`} disabled={index === pages.length - 1 || reorderPages.isPending} onClick={() => movePage(index, 1)}>↓</button>
                      <button type="button" className="bl-quiet" onClick={() => { setEditTitle(page.title || ""); setEditingId(page.id); }}>Rename</button>
                      <button type="button" className="bl-icon-button danger" aria-label={`Remove ${page.title || redactReviewUrl(page.url_normalized)}`} onClick={() => setRemoveTarget(page)}>×</button>
                    </div>
                  </>}
                </li>
              ))}
            </ol>
          )}
          <p className="bl-pages-hint">Order changes save immediately. A page can be removed only while it has no comments or saved versions.</p>
        </div>
        <footer className="bl-dialog-actions bl-dialog-actions-bordered"><button type="button" className="bl-quiet" onClick={onClose}>Done</button></footer>
      </Dialog>
      {removeTarget && (
        <Dialog title="Remove empty page?" onClose={() => setRemoveTarget(null)}>
          <div className="bl-confirm-body">
            <span className="bl-confirm-icon warning"><PageIcon /></span>
            <div><p>Remove <strong>{removeTarget.title || redactReviewUrl(removeTarget.url_normalized)}</strong> from this project?</p><small>This only works for a page with no comments or saved versions. No feedback is deleted.</small></div>
          </div>
          {removePage.error && <p role="alert" className="bl-error bl-confirm-error">{removePage.error.message}</p>}
          <footer className="bl-dialog-actions bl-dialog-actions-bordered"><button type="button" className="bl-quiet" onClick={() => setRemoveTarget(null)}>Cancel</button><button type="button" className="bl-button danger" disabled={removePage.isPending} onClick={() => removePage.mutate(removeTarget.id)}>{removePage.isPending ? "Checking…" : "Remove page"}</button></footer>
        </Dialog>
      )}
    </>
  );
}
