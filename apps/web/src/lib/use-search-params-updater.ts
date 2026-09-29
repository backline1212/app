import { useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

// Updates made earlier in the current task, not yet reflected in the URL.
let pending: URLSearchParams | null = null;

/**
 * Changes some of the URL's query parameters and keeps the rest.
 *
 * react-router's own functional form, setSearchParams(prev => next), hands `prev` from
 * the render that created the setter, so two updates in one event don't compose: the
 * second is built on the URL as it was before the first and silently undoes it. The
 * review canvas does exactly that - opening a comment's thread and switching to the
 * page it's on are two updates from one click. Each update here starts from the
 * previous one made in the same task, or the current URL once that has settled.
 * `mutate` may return false to leave the URL as it is.
 */
export function useSearchParamsUpdater() {
  const [, setSearchParams] = useSearchParams();
  // The router's setter changes identity with every URL change; this one doesn't, so it
  // can sit in effect dependency lists without re-running them on each navigation.
  const setterRef = useRef(setSearchParams);
  useEffect(() => {
    setterRef.current = setSearchParams;
  });
  return useCallback(
    (mutate: (params: URLSearchParams) => boolean | void, options: { replace?: boolean } = { replace: true }) => {
      const next = new URLSearchParams(pending ?? window.location.search);
      if (mutate(next) === false) return;
      if (!pending) {
        // A macrotask later: the router applies a navigation within microtasks, so by
        // then the URL itself is the base again.
        setTimeout(() => {
          pending = null;
        }, 0);
      }
      pending = next;
      setterRef.current(next, options);
    },
    [],
  );
}
