import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useAuth } from "../auth/AuthContext";
import { qk } from "../../lib/query-keys";
import { useDocumentTitle } from "../../lib/use-document-title";
import * as workspacesApi from "./api";
import type { TranslationKeys } from "../../lib/i18n";

export function WorkspacePickerPage() {
  const { t } = useTranslation();
  const { switchWorkspace, logout, user } = useAuth();
  useDocumentTitle(t('workspacePicker.title' as TranslationKeys));
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: workspaces, isLoading, error: listError, refetch } = useQuery({
    queryKey: qk.workspaces(),
    queryFn: workspacesApi.listWorkspaces,
  });

  async function enterWorkspace(workspaceId: string, slug: string) {
    setError(null);
    try {
      await switchWorkspace(workspaceId);
      navigate(`/w/${slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open that workspace.");
    }
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const workspace = await workspacesApi.createWorkspace(newWorkspaceName.trim());
      await queryClient.invalidateQueries({ queryKey: qk.workspaces() });
      await enterWorkspace(workspace.id, workspace.slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create workspace.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="wsp">
      <div className="wsp-card">
        {/* Brand */}
        <div className="wsp-head">
          <span className="lg-mark">B</span>
          <span><b>Backline</b><em>CLIENT REVIEW, IN ONE PLACE</em></span>
        </div>

        <div className="wsp-body">
          {/* Title + sign out */}
          <div className="wsp-title">
            <h1>{t('workspacePicker.title' as TranslationKeys)}</h1>
            <button className="wsp-signout" onClick={() => logout()}>
              {t('account.signOut' as TranslationKeys)}
            </button>
          </div>
          {user && <p className="wsp-email">{user.email}</p>}

          {/* Loading state */}
          {isLoading && <p className="wsp-loading">Loading workspaces…</p>}
          {listError && (
            <p className="wsp-err" role="alert">
              <span>{listError.message}</span>{" "}
              <button type="button" className="wsp-signout" onClick={() => void refetch()}>Try again</button>
            </p>
          )}

          {/* Workspace list */}
          {workspaces && workspaces.length > 0 && (
            <div className="wsp-list">
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  className="wsp-item"
                  onClick={() => enterWorkspace(ws.id, ws.slug)}
                >
                  <span className="wsp-mark">{ws.name.slice(0, 1).toUpperCase()}</span>
                  <span className="wsp-item-name">{ws.name}</span>
                  <span className="wsp-item-arrow">
                    {t('workspacePicker.select' as TranslationKeys)}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </span>
                </button>
              ))}
            </div>
          )}

          {workspaces && workspaces.length === 0 && (
            <p className="wsp-empty">
              You don't belong to any workspaces yet — create one below to get started.
            </p>
          )}

          {/* Divider */}
          <div className="wsp-div" />

          {/* New workspace form */}
          <form className="wsp-form" onSubmit={handleCreate}>
            <h2>{t('workspacePicker.newWorkspace' as TranslationKeys)}</h2>
            <input
              type="text"
              required
              maxLength={200}
              aria-label="Workspace name"
              placeholder="Acme Corp"
              value={newWorkspaceName}
              onChange={(event) => setNewWorkspaceName(event.target.value)}
              spellCheck="false"
            />
            {error && (
              <p className="wsp-err">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
                <span>{error}</span>
              </p>
            )}
            <button type="submit" className="wsp-submit" disabled={isSubmitting || !newWorkspaceName.trim()}>
              {isSubmitting ? <span className="lg-spin" /> : null}
              {t('workspacePicker.newWorkspace' as TranslationKeys)}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="wsp-foot">
          <span className="c">&copy; {new Date().getFullYear()} Backline</span>
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
          <a href="#">Support</a>
        </div>
      </div>
    </main>
  );
}
