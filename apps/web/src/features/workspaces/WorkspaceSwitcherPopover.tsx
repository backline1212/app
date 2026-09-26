import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { qk } from "../../lib/query-keys";
import { createWorkspace, listWorkspaces } from "./api";
import type { WorkspaceOut } from "./api";
import { useOnClickOutside } from "../../lib/use-click-outside";

interface WorkspaceSwitcherPopoverProps {
  currentWorkspace: WorkspaceOut;
  onClose: () => void;
}

// design/index.html wsPop marks: the current workspace is ink/mint, the others get a color.
const WS_COLORS = ["#E86A33", "#7C6BE8", "#2C4B69", "#0A6B4B", "#A8401F", "#6B520B"];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "workspace";
}

export function WorkspaceSwitcherPopover({
  currentWorkspace,
  onClose,
}: WorkspaceSwitcherPopoverProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const popRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<HTMLButtonElement[]>([]);
  const [focusIndex, setFocusIndex] = useState(-1);

  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const busy = useRef(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const { data: workspaces = [], isLoading, isError, refetch } = useQuery({
    queryKey: qk.workspaces(),
    queryFn: listWorkspaces,
  });

  // Close on outside click
  useOnClickOutside(popRef, onClose);

  useEffect(() => {
    const previous = document.activeElement;
    popRef.current?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  async function handleSwitch(ws: WorkspaceOut) {
    if (busy.current) return;
    if (ws.id === currentWorkspace.id) {
      onClose();
      return;
    }
    busy.current = true;
    setCreating(true);
    setCreateError(null);
    try {
      // The destination layout owns token switching, avoiding a race with the old route.
      navigate(`/w/${ws.slug}`);
      onClose();
    } finally {
      busy.current = false;
      setCreating(false);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim() || busy.current) return;
    busy.current = true;
    setCreating(true);
    setCreateError(null);
    try {
      const ws = await createWorkspace(newName.trim());
      queryClient.setQueryData<WorkspaceOut[]>(qk.workspaces(), (old) => [...(old ?? []), ws]);
      navigate(`/w/${ws.slug}`);
      onClose();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not create workspace.");
    } finally {
      busy.current = false;
      setCreating(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(focusIndex + 1, workspaces.length - 1);
      setFocusIndex(next);
      itemsRef.current[next]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.max(focusIndex - 1, 0);
      setFocusIndex(next);
      itemsRef.current[next]?.focus();
    }
  }

  const slugPreview = newName ? slugify(newName) : "";

  return (
    <div
      ref={popRef}
      className="bl-ws-pop"
      role="dialog"
      tabIndex={-1}
      aria-label="Switch workspace"
      onKeyDown={handleKeyDown}
    >
      <div className="bl-pop-label">SWITCH WORKSPACE</div>
      <div className="bl-ws-pop-list" role="listbox" aria-label="Workspaces">
        {isLoading && <p role="status">Loading workspaces…</p>}
        {isError && <p role="alert">Could not load workspaces. <button onClick={() => void refetch()}>Retry</button></p>}
        {workspaces.map((ws, i) => {
          const current = ws.id === currentWorkspace.id;
          return (
            <button
              key={ws.id}
              ref={(el) => { if (el) itemsRef.current[i] = el; }}
              className="bl-ws-item"
              role="option"
              aria-selected={current}
              disabled={creating}
              onFocus={() => setFocusIndex(i)}
              onClick={() => void handleSwitch(ws)}
            >
              <span className="bl-ws-item-mk" style={current ? undefined : { background: WS_COLORS[i % WS_COLORS.length], color: "#fff" }}>{ws.name.slice(0, 1).toUpperCase()}</span>
              <span className="bl-ws-item-name">
                {ws.name}
                <span>{ws.role ? ws.role.charAt(0).toUpperCase() + ws.role.slice(1) : "Member"}</span>
              </span>
              <span className="bl-ws-item-tick" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
              </span>
            </button>
          );
        })}
      </div>
      <div className="bl-pop-sep" />
      {!showCreate ? (
        <button type="button" className="bl-ws-item" onClick={() => setShowCreate(true)}>
          <span className="bl-ws-item-mk is-new">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
          </span>
          Create workspace
        </button>
      ) : (
      <form className="bl-ws-create-form" onSubmit={(e) => void handleCreate(e)}>
        <p className="bl-eyebrow" style={{ margin: 0 }}>New workspace</p>
        <input
          autoFocus
          className="bl-input"
          placeholder="Workspace name"
          aria-label="Workspace name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          maxLength={120}
          required
        />
        {slugPreview && (
          <p className="bl-ws-slug-preview">Slug: {slugPreview} (a suffix is added if taken)</p>
        )}
        {createError && (
          <p className="bl-error" role="alert" style={{ margin: 0 }}>{createError}</p>
        )}
        <button
          type="submit"
          className="bl-button"
          disabled={creating || !newName.trim()}
        >
          {creating ? "Creating…" : "Create"}
        </button>
      </form>
      )}
    </div>
  );
}
