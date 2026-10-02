// Runs one existing per-item request for each selected row (TDR-0058) - a few at a
// time, so a page of 50 doesn't fire 50 requests at once. Each request goes through
// that endpoint's own permission check and audit trail, so one row the person may not
// change fails on its own instead of failing the whole batch.
export interface BulkResult<T> {
  done: T[];
  failed: { item: T; error: Error }[];
}

export async function runBulk<T>(items: readonly T[], task: (item: T) => Promise<unknown>, concurrency = 4): Promise<BulkResult<T>> {
  const result: BulkResult<T> = { done: [], failed: [] };
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const item = items[next++];
      try {
        await task(item);
        result.done.push(item);
      } catch (error) {
        result.failed.push({ item, error: error instanceof Error ? error : new Error(String(error)) });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return result;
}

// "3 tickets", "1 ticket".
export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

// One toast line for a finished batch: what happened, and the first reason anything
// was refused (they are almost always the same reason - a permission or a plan limit).
export function bulkSummary<T>(result: BulkResult<T>, noun: string, pastTense: string): { message: string; variant: "success" | "warning" | "error" } {
  const { done, failed } = result;
  if (failed.length === 0) return { message: `${plural(done.length, noun)} ${pastTense}.`, variant: "success" };
  const reason = failed[0].error.message;
  if (done.length === 0) return { message: `Nothing was ${pastTense}: ${reason}`, variant: "error" };
  return { message: `${plural(done.length, noun)} ${pastTense}; ${failed.length} couldn't be: ${reason}`, variant: "warning" };
}
