// A tab opened before a deploy still asks for the old build's JS chunks, which the new
// deploy no longer serves: "Failed to fetch dynamically imported module". Reloading
// picks up the new build. A short guard stops a reload loop when the chunk is missing
// for some other reason (offline, a broken deploy); the error screen takes over then.

const RELOADED_AT = "backline:stale-build-reload-at";
const GUARD_MS = 15_000;

export function isStaleBuildError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? "");
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|ChunkLoadError|Unable to preload CSS/i.test(message);
}

/** Reloads once per GUARD_MS; false when it just did (so the caller shows an error). */
export function reloadForNewBuild(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOADED_AT)) || 0;
    if (Date.now() - last < GUARD_MS) return false;
    sessionStorage.setItem(RELOADED_AT, String(Date.now()));
  } catch {
    // Without storage there's no loop guard; let the error screen offer the reload.
    return false;
  }
  window.location.reload();
  return true;
}
