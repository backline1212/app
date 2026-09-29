import { useSearchParams } from "react-router-dom";
import { useCallback } from "react";
import { useSearchParamsUpdater } from "../../../../lib/use-search-params-updater";
import type { CommentStatus } from "../../../board/api";
import type { LayerFilter, SortOrder } from "./types";

export function useCommentFilters() {
  const [searchParams] = useSearchParams();
  // Composes with every other URL update in the same event (the canvas's page switch,
  // another filter) - see use-search-params-updater.ts for why react-router's own
  // functional setSearchParams doesn't.
  const updateSearchParams = useSearchParamsUpdater();

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
    updateSearchParams((next) => {
      if (next.get(key) === value) return false;
      if (value === null) next.delete(key);
      else next.set(key, value);
    });
  }, [updateSearchParams]);

  const updateArrayParam = useCallback((key: string, values: string[] | ((prev: string[]) => string[])) => {
    updateSearchParams((next) => {
      const newValues = typeof values === "function" ? values(next.getAll(key)) : values;
      next.delete(key);
      newValues.forEach((v) => next.append(key, v));
    });
  }, [updateSearchParams]);

  // Resolved against the URL's latest value (including an update earlier in the same
  // event), not the `activeStatus` closed over at render time - a double-click would
  // otherwise resolve both clicks against the same stale value instead of composing.
  const setActiveStatus = useCallback(
    (status: CommentStatus | null | ((prev: CommentStatus | null) => CommentStatus | null)) => {
      updateSearchParams((next) => {
        const current = (next.get("status") as CommentStatus) || null;
        const resolved = typeof status === "function" ? status(current) : status;
        if (resolved === null) next.delete("status");
        else next.set("status", resolved);
      });
    },
    [updateSearchParams],
  );

  // Memoized, unlike its plain-arrow siblings below: CommentsTab keeps this in effects'
  // dependency lists, and a fresh identity every render would resubscribe them on every
  // render.
  const setOpenThreadId = useCallback(
    (threadId: string | null) => updateParam("thread", threadId),
    [updateParam],
  );

  // Every filter back to its default in one URL update - the list's "No comments match"
  // state offers this; the sort, display and grouping choices are left as they were.
  const clearFilters = useCallback(() => {
    updateSearchParams((next) => {
      for (const key of ["status", "hideResolved", "layer", "currentPageOnly", "tags", "deviceTypes", "browsers", "assignees"]) {
        next.delete(key);
      }
    });
  }, [updateSearchParams]);

  return {
    clearFilters,
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
