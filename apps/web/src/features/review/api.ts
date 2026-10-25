import type { Schemas } from "@backline/types";

import { API_BASE_URL, apiFetch, toApiError } from "../../lib/api-client";

export type ReviewResolveOut = Schemas["ReviewResolveOut"];
export type GuestSessionOut = Schemas["GuestSessionOut"];
export type GuestBoardOut = Schemas["GuestBoardOut"];

export async function getGuestSessionStatus(token: string, signal?: AbortSignal): Promise<Schemas["GuestSessionStatusOut"]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/guest-sessions/current`, {
    credentials: "omit", cache: "no-store", headers: { "X-Guest-Session": token }, signal,
  });
  if (!response.ok) {
    throw await toApiError(response, "GUEST_SESSION_ERROR", "Could not check your review session. Try again.");
  }
  return response.json() as Promise<Schemas["GuestSessionStatusOut"]>;
}

export function resolveShareLink(shareToken: string): Promise<ReviewResolveOut> {
  return apiFetch<ReviewResolveOut>(`/api/v1/review/${shareToken}`);
}

/** A one-time, two-minute code that carries this session to the website under review,
 * instead of the session token itself (FLOW-01). */
export async function createGuestHandoff(token: string): Promise<Schemas["GuestHandoffOut"]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/guest-sessions/current/handoff`, {
    method: "POST", credentials: "omit", cache: "no-store",
    headers: { "X-Guest-Session": token },
  });
  if (!response.ok) {
    throw await toApiError(response, "GUEST_SESSION_ERROR", "Could not open the website review. Try again.");
  }
  return response.json() as Promise<Schemas["GuestHandoffOut"]>;
}

export async function endGuestSession(token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/guest-sessions/current/end`, {
    method: "POST", credentials: "omit", cache: "no-store",
    headers: { "X-Guest-Session": token },
  });
  if (!response.ok) {
    throw await toApiError(response, "GUEST_SESSION_ERROR", "Could not end this review session.");
  }
}

export function createGuestSession(
  shareToken: string,
  displayName: string,
  passcode?: string,
  email?: string,
): Promise<GuestSessionOut> {
  return apiFetch<GuestSessionOut>("/api/v1/guest-sessions", {
    method: "POST",
    body: JSON.stringify({
      share_token: shareToken,
      display_name: displayName,
      passcode: passcode || null,
      email: email || null,
    }),
  });
}

// Guest requests never carry the member cookie/Authorization header - the guest
// session token rides in X-Guest-Session instead (matches assets/api.ts's
// assetRequest convention, and backend/tests/helpers.py's guest_headers fixture).
export async function getGuestBoard(projectId: string, guestToken: string): Promise<GuestBoardOut> {
  const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/guest-board`, {
    credentials: "omit", cache: "no-store", headers: { "X-Guest-Session": guestToken },
  });
  if (!response.ok) {
    throw await toApiError(response, "GUEST_BOARD_ERROR", "Could not load the board. Try again.");
  }
  return response.json() as Promise<GuestBoardOut>;
}
