import { useSyncExternalStore } from "react";
import type { Schemas } from "@backline/types";

/**
 * What a finished project move left for the person to follow up (TDR-0245). It is held
 * outside the page that started the move, because that project's card or screen goes
 * away as soon as the lists refresh.
 */
export interface MoveResult {
  projectName: string;
  openPath: string;
  outcome: Schemas["ProjectTransferOut"];
}

let current: MoveResult | null = null;
const listeners = new Set<() => void>();

export function showMoveResult(result: MoveResult | null) {
  current = result;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useMoveResult() {
  return useSyncExternalStore(subscribe, () => current);
}
