import { useSearchParams } from "react-router-dom";
import { useCallback } from "react";
import type { CommentStatus } from "../../../board/api";
import type { LayerFilter, SortOrder } from "./types";

export function useCommentFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const activeStatus = (searchParams.get("status") as CommentStatus) || null;
  const hideResolved = searchParams.get("hideResolved") === "true";
  const layerFilter = (searchParams.get("layer") as LayerFilter) || "all";
  const sortOrder = (searchParams.get("sort") as SortOrder) || "newest";
  const currentPageOnly = searchParams.get("currentPageOnly") === "true";
  
  const activeTags = searchParams.getAll("tags");
  const activeDeviceTypes = searchParams.getAll("deviceTypes");
  const activeBrowsers = searchParams.getAll("browsers");
  const activeAssignees = searchParams.getAll("assignees");
  
  const displayMode = (searchParams.get("display") as "comfortable" | "compact") || "comfortable";
  const groupBy = (searchParams.get("groupBy") as "none" | "page") || "none";
  const openThreadId = searchParams.get("thread") || null;

  const updateParam = useCallback((key: string, value: string | null) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value === null) next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const updateArrayParam = useCallback((key: string, values: string[] | ((prev: string[]) => string[])) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      let newValues: string[];
      if (typeof values === "function") {
        newValues = values(next.getAll(key));
      } else {
        newValues = values;
      }
      next.delete(key);
      newValues.forEach(v => next.append(key, v));
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Resolves the updater against the URL's current value inside setSearchParams'
  // own callback (like updateArrayParam does), not the `activeStatus` closed over at
  // render time - two calls in the same tick (e.g. a double-click) would otherwise
  // both resolve against the same stale value instead of composing.
  const setActiveStatus = useCallback(
    (status: CommentStatus | null | ((prev: CommentStatus | null) => CommentStatus | null)) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        const current = (prev.get("status") as CommentStatus) || null;
        const resolved = typeof status === "function" ? status(current) : status;
        if (resolved === null) next.delete("status");
        else next.set("status", resolved);
        return next;
      }, { replace: true });
    },
    [setSearchParams],
  );

  // Memoized, unlike its plain-arrow siblings above: CommentsTab keeps this in an
  // effect's dependency list (following a canvas pin click into the open detail), and a
  // fresh identity every render would resubscribe that effect on every render.
  const setOpenThreadId = useCallback(
    (threadId: string | null) => updateParam("thread", threadId),
    [updateParam],
  );

  return {
    activeStatus,
    setActiveStatus,
    hideResolved,
    setHideResolved: (hide: boolean) => updateParam("hideResolved", hide ? "true" : null),
    layerFilter,
    setLayerFilter: (layer: LayerFilter) => updateParam("layer", layer === "all" ? null : layer),
    sortOrder,
    setSortOrder: (sort: SortOrder) => updateParam("sort", sort === "newest" ? null : sort),
    currentPageOnly,
    setCurrentPageOnly: (curr: boolean) => updateParam("currentPageOnly", curr ? "true" : null),
    activeTags,
    setActiveTags: (tags: string[] | ((prev: string[]) => string[])) => updateArrayParam("tags", tags),
    activeDeviceTypes,
    setActiveDeviceTypes: (devices: string[] | ((prev: string[]) => string[])) => updateArrayParam("deviceTypes", devices),
    activeBrowsers,
    setActiveBrowsers: (browsers: string[] | ((prev: string[]) => string[])) => updateArrayParam("browsers", browsers),
    activeAssignees,
    setActiveAssignees: (assignees: string[] | ((prev: string[]) => string[])) => updateArrayParam("assignees", assignees),
    displayMode,
    setDisplayMode: (mode: "comfortable" | "compact") => updateParam("display", mode === "comfortable" ? null : mode),
    groupBy,
    setGroupBy: (group: "none" | "page") => updateParam("groupBy", group === "none" ? null : group),
    openThreadId,
    setOpenThreadId,
  };
}
