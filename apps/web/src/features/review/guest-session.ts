export interface StoredGuestSession {
  guestSessionToken: string;
  displayName: string;
}

// Mirrors apps/widget/src/guest-session.ts's storage contract (same key shape,
// same sessionStorage-not-localStorage choice per 07-Review-SDK.md §7.2: a share
// link's guest identity shouldn't silently persist across unrelated future visits
// from the same device) so a guest who leaves ReviewEntryPage and comes back -
// same tab, same share link - resumes as themselves instead of re-entering their
// name, and so "Leave review" in AssetReview/GuestBoard has something to clear.
function storageKey(shareToken: string): string {
  return `backline:guest-session:${shareToken}`;
}

export function getStoredGuestSession(shareToken: string): StoredGuestSession | null {
  try {
    const raw = sessionStorage.getItem(storageKey(shareToken));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredGuestSession> | null;
    if (typeof parsed?.guestSessionToken === "string" && parsed.guestSessionToken && typeof parsed.displayName === "string") {
      return { guestSessionToken: parsed.guestSessionToken, displayName: parsed.displayName };
    }
    clearStoredGuestSession(shareToken);
    return null;
  } catch {
    clearStoredGuestSession(shareToken);
    return null;
  }
}

export function setStoredGuestSession(shareToken: string, session: StoredGuestSession): void {
  try {
    sessionStorage.setItem(storageKey(shareToken), JSON.stringify(session));
  } catch {
    // Private-browsing/storage-disabled: the guest still finishes this visit
    // normally, they just won't be recovered on a later reload.
  }
}

export function clearStoredGuestSession(shareToken: string): void {
  try {
    sessionStorage.removeItem(storageKey(shareToken));
  } catch {
    // Nothing to clean up if storage was never writable.
  }
}
