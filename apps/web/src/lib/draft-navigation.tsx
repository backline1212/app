import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, MutableRefObject } from "react";
import { useBlocker, useLocation } from "react-router-dom";
import type { BlockerFunction } from "react-router-dom";
import { Dialog } from "../components/Dialog";
import { useAuth } from "../features/auth/AuthContext";
import { WORKSPACE_ACCESS_LOST_EVENT } from "./api-client";

type Draft = {
  name: string;
  dirty: boolean;
  pending: boolean;
  unconfirmed: boolean;
  discard: () => void;
  shouldBlock?: BlockerFunction;
};

type DraftContextValue = {
  register: (id: string, draft: MutableRefObject<Draft>) => () => void;
  refresh: () => void;
  blocked: boolean;
};

const DraftContext = createContext<DraftContextValue | null>(null);

function protectedDraft(draft: Draft): boolean {
  return draft.dirty || draft.pending || draft.unconfirmed;
}

const differentLocation: BlockerFunction = ({ currentLocation, nextLocation }) =>
  currentLocation.pathname !== nextLocation.pathname
  || currentLocation.search !== nextLocation.search
  || currentLocation.hash !== nextLocation.hash;

export function DraftNavigationProvider({ children }: { children: ReactNode }) {
  const drafts = useRef(new Map<string, MutableRefObject<Draft>>());
  const matches = useRef(new Map<string, boolean>());
  const navigationRef = useRef<Parameters<BlockerFunction>[0] | null>(null);
  const forcedNavigation = useRef(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const location = useLocation();
  const { status, workspaceId, user } = useAuth();
  const identity = `${status}/${workspaceId ?? ""}/${user?.id ?? ""}`;
  const previousIdentity = useRef(identity);
  if (previousIdentity.current !== identity) {
    // Token loss, sign-out and workspace/identity switches must clear protected
    // screens even when a draft is open. An ordinary guest route stays guarded.
    if (!previousIdentity.current.startsWith("loading/")) forcedNavigation.current = true;
    previousIdentity.current = identity;
  }

  const refresh = useCallback(() => setRevision(value => value + 1), []);
  const register = useCallback((id: string, draft: MutableRefObject<Draft>) => {
    drafts.current.set(id, draft);
    refresh();
    return () => {
      drafts.current.delete(id);
      matches.current.delete(id);
      refresh();
    };
  }, [refresh]);

  const blocker = useBlocker(useCallback<BlockerFunction>((navigation) => {
    if (forcedNavigation.current) return false;
    navigationRef.current = navigation;
    const affected = new Map<string, boolean>();
    for (const [id, draft] of drafts.current) {
      // Evaluate every predicate, even for a clean form: some callers consume a
      // deliberate one-navigation exemption on their next URL change.
      const applies = (draft.current.shouldBlock ?? differentLocation)(navigation);
      affected.set(id, applies);
    }
    matches.current = affected;
    return [...drafts.current].some(([id, draft]) =>
      affected.get(id) && protectedDraft(draft.current));
  }, []));

  // A form can mount while a transition is blocked. Add it before the user may
  // discard the route; removed or saved forms stop holding the navigation.
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (forcedNavigation.current) { blocker.proceed(); return; }
    let added = false;
    for (const [id, draft] of drafts.current) {
      if (matches.current.has(id)) continue;
      if (!navigationRef.current) continue;
      matches.current.set(id, (draft.current.shouldBlock ?? differentLocation)(navigationRef.current));
      added = true;
    }
    if (added) { refresh(); return; }
    if (![...drafts.current].some(([id, draft]) =>
      matches.current.get(id) && protectedDraft(draft.current))) blocker.proceed();
  }, [blocker, refresh, revision]);

  useEffect(() => { forcedNavigation.current = false; }, [location.key]);

  useEffect(() => {
    const onAccessLoss = () => {
      forcedNavigation.current = true;
      if (blocker.state === "blocked") blocker.proceed();
    };
    window.addEventListener(WORKSPACE_ACCESS_LOST_EVENT, onAccessLoss);
    return () => window.removeEventListener(WORKSPACE_ACCESS_LOST_EVENT, onAccessLoss);
  }, [blocker]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (![...drafts.current.values()].some(draft => protectedDraft(draft.current))) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  const affected = blocker.state === "blocked"
    ? [...drafts.current].filter(([id, draft]) => matches.current.get(id) && protectedDraft(draft.current))
    : [];
  const pending = affected.some(([, draft]) => draft.current.pending);
  const unconfirmed = affected.some(([, draft]) => draft.current.unconfirmed);
  const names = [...new Set(affected.map(([, draft]) => draft.current.name))];

  function discardAndContinue() {
    if (blocker.state !== "blocked" || pending) return;
    // The current list includes all nested drafts affected by this route. A
    // newly registered form is evaluated in the effect before this button opens.
    try {
      for (const [, draft] of affected) draft.current.discard();
      setError("");
      blocker.proceed();
    } catch {
      setError("This draft could not be discarded. Stay and review it before leaving.");
    }
  }

  const value = useMemo(() => ({ register, refresh, blocked: blocker.state === "blocked" }),
    [register, refresh, blocker.state]);
  return <DraftContext.Provider value={value}>
    {children}
    {blocker.state === "blocked" && affected.length > 0 && <Dialog title="Keep your drafts?" onClose={() => { setError(""); blocker.reset(); }}>
      <div className="bl-form">
        <p>{pending ? "A save or upload is in progress. Wait for the result before leaving." : unconfirmed ? "Some saves are unconfirmed and may already exist. Stay to retry or copy the original work before leaving." : "You have unsaved work. Stay to save or copy it, or discard it and continue."}</p>
        <p>Affected drafts: {names.join(", ")}.</p>
        {error && <p role="alert" className="bl-error">{error}</p>}
      </div>
      <footer className="bl-dialog-actions bl-dialog-actions-bordered">
        <button type="button" className="bl-button" onClick={() => { setError(""); blocker.reset(); }}>Stay and review</button>
        <button type="button" className="bl-button" disabled={pending} onClick={discardAndContinue}>Discard drafts and continue</button>
      </footer>
    </Dialog>}
  </DraftContext.Provider>;
}

// The provider and its registration hook deliberately share this private context.
// eslint-disable-next-line react-refresh/only-export-components
export function useDraftNavigationGuard(draft: Draft): { blocked: boolean } {
  const context = useContext(DraftContext);
  if (!context) throw new Error("DraftNavigationProvider is required");
  const id = useId();
  const current = useRef(draft);
  current.current = draft;
  const { register, refresh } = context;
  useLayoutEffect(() => register(id, current), [id, register]);
  useLayoutEffect(() => { refresh(); }, [refresh, draft.dirty, draft.pending, draft.unconfirmed]);
  return { blocked: context.blocked };
}
