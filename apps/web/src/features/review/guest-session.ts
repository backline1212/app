export interface StoredGuestSession {
  guestSessionToken: string;
  displayName: string;
}

export interface RememberedReviewer {
  displayName: string;
  email: string;
}

// Mirrors apps/widget/src/guest-session.ts's storage contract (same key shape). By
// default a review identity lives in sessionStorage per 07-Review-SDK.md §7.2: it
// shouldn't silently persist across unrelated visits from the same device. A reviewer
// who ticks "Remember me on this device" (TDR-0208) keeps it in localStorage instead,
// so following the team's "new reply" email in a new tab resumes as themselves - with
// their own comments still editable - rather than joining again as someone new.
// "Leave review" clears both.
function storageKey(shareToken: string): string {
  return `backline:guest-session:${shareToken}`;
}

function reviewerKey(shareToken: string): string {
  return `backline:reviewer:${shareToken}`;
}

function parseSession(raw: string | null): StoredGuestSession | null {
  if (!raw) return null;
  const parsed = JSON.parse(raw) as Partial<StoredGuestSession> | null;
  if (typeof parsed?.guestSessionToken === "string" && parsed.guestSessionToken && typeof parsed.displayName === "string") {
    return { guestSessionToken: parsed.guestSessionToken, displayName: parsed.displayName };
  }
  return null;
}

export function getStoredGuestSession(shareToken: string): StoredGuestSession | null {
  try {
    const session = parseSession(sessionStorage.getItem(storageKey(shareToken))) ?? parseSession(localStorage.getItem(storageKey(shareToken)));
    if (!session) clearStoredGuestSession(shareToken);
    return session;
  } catch {
    clearStoredGuestSession(shareToken);
    return null;
  }
}

export function setStoredGuestSession(shareToken: string, session: StoredGuestSession, remember = false): void {
  try {
    sessionStorage.setItem(storageKey(shareToken), JSON.stringify(session));
    if (remember) localStorage.setItem(storageKey(shareToken), JSON.stringify(session));
    else localStorage.removeItem(storageKey(shareToken));
  } catch {
    // Private-browsing/storage-disabled: the guest still finishes this visit
    // normally, they just won't be recovered on a later reload.
  }
}

export function clearStoredGuestSession(shareToken: string): void {
  try {
    sessionStorage.removeItem(storageKey(shareToken));
    localStorage.removeItem(storageKey(shareToken));
  } catch {
    // Nothing to clean up if storage was never writable.
  }
}

/** The name and email a reviewer chose to remember, to prefill a later join. */
export function getRememberedReviewer(shareToken: string): RememberedReviewer | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(reviewerKey(shareToken)) ?? "null") as Partial<RememberedReviewer> | null;
    return typeof parsed?.displayName === "string" ? { displayName: parsed.displayName, email: typeof parsed.email === "string" ? parsed.email : "" } : null;
  } catch {
    return null;
  }
}

export function setRememberedReviewer(shareToken: string, reviewer: RememberedReviewer | null): void {
  try {
    if (reviewer) localStorage.setItem(reviewerKey(shareToken), JSON.stringify(reviewer));
    else localStorage.removeItem(reviewerKey(shareToken));
  } catch {
    // Storage disabled: nothing is remembered.
  }
}
