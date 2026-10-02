import type { Schemas } from "@backline/types";

import { apiFetch } from "../../lib/api-client";

export type WorkspaceOut = Schemas["WorkspaceOut"];
export type MemberOut = Schemas["MemberOut"];
export type JoinRequestOut = Schemas["JoinRequestOut"];
export type JoinRequestResponse = Schemas["JoinRequestResponse"];
export type JoinPreviewOut = Schemas["JoinPreviewOut"];
export type MyJoinRequestOut = Schemas["MyJoinRequestOut"];
export type AccessMatrixOut = Schemas["AccessMatrixOut"];
export type AccessMatrixProjectOut = Schemas["AccessMatrixProjectOut"];
export type MemberProfileUpdate = Schemas["MemberProfileUpdate"];
export type WorkspaceUpdate = Schemas["WorkspaceUpdate"];
export type WorkspaceMemberRole = "admin" | "member";

export function listWorkspaces(): Promise<WorkspaceOut[]> {
  return apiFetch<WorkspaceOut[]>("/api/v1/workspaces");
}

export function createWorkspace(name: string): Promise<WorkspaceOut> {
  return apiFetch<WorkspaceOut>("/api/v1/workspaces", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function getWorkspace(workspaceId: string): Promise<WorkspaceOut> {
  return apiFetch<WorkspaceOut>(`/api/v1/workspaces/${workspaceId}`);
}

export function updateWorkspace(workspaceId: string, update: WorkspaceUpdate): Promise<WorkspaceOut> {
  return apiFetch<WorkspaceOut>(`/api/v1/workspaces/${workspaceId}`, {
    method: "PATCH",
    body: JSON.stringify(update),
  });
}

/** Turns joining by room code on. Without `code`, the server generates one. */
export function setRoomCode(workspaceId: string, code?: string): Promise<WorkspaceOut> {
  return apiFetch<WorkspaceOut>(`/api/v1/workspaces/${workspaceId}/room-code`, {
    method: "POST",
    body: JSON.stringify(code ? { code } : {}),
  });
}

export function disableRoomCode(workspaceId: string): Promise<WorkspaceOut> {
  return apiFetch<WorkspaceOut>(`/api/v1/workspaces/${workspaceId}/room-code`, { method: "DELETE" });
}

export function listMembers(workspaceId: string): Promise<MemberOut[]> {
  return apiFetch<MemberOut[]>(`/api/v1/workspaces/${workspaceId}/members`);
}

export function inviteMember(
  workspaceId: string,
  email: string,
  role: WorkspaceMemberRole,
): Promise<MemberOut> {
  return apiFetch<MemberOut>(`/api/v1/workspaces/${workspaceId}/members/invite`, {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
}

export function updateMemberRole(
  workspaceId: string,
  memberId: string,
  role: WorkspaceMemberRole,
): Promise<void> {
  return apiFetch<void>(`/api/v1/workspaces/${workspaceId}/members/${memberId}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

/** Title, team and reporting line. Send `manager_user_id: null` to clear it. */
export function updateMemberProfile(
  workspaceId: string,
  memberId: string,
  changes: MemberProfileUpdate,
): Promise<MemberOut> {
  return apiFetch<MemberOut>(`/api/v1/workspaces/${workspaceId}/members/${memberId}/profile`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  });
}

export function removeMember(workspaceId: string, memberId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/workspaces/${workspaceId}/members/${memberId}`, {
    method: "DELETE",
  });
}

export function leaveWorkspace(workspaceId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/workspaces/${workspaceId}/leave`, { method: "POST" });
}

export function transferOwnership(workspaceId: string, memberId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/workspaces/${workspaceId}/transfer-ownership`, {
    method: "POST",
    body: JSON.stringify({ member_id: memberId }),
  });
}

export function getAccessMatrix(workspaceId: string): Promise<AccessMatrixOut> {
  return apiFetch<AccessMatrixOut>(`/api/v1/workspaces/${workspaceId}/access-matrix`);
}

export function previewJoin(roomCode: string): Promise<JoinPreviewOut> {
  return apiFetch<JoinPreviewOut>("/api/v1/workspaces/join/preview", {
    method: "POST",
    body: JSON.stringify({ room_code: roomCode }),
  });
}

export function submitJoinRequest(roomCode: string, message?: string): Promise<JoinRequestResponse> {
  return apiFetch<JoinRequestResponse>("/api/v1/workspaces/join", {
    method: "POST",
    body: JSON.stringify({ room_code: roomCode, ...(message?.trim() ? { message: message.trim() } : {}) }),
  });
}

export function listMyJoinRequests(): Promise<MyJoinRequestOut[]> {
  return apiFetch<MyJoinRequestOut[]>("/api/v1/join-requests/mine");
}

export function cancelMyJoinRequest(requestId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/join-requests/${requestId}`, { method: "DELETE" });
}

export function listJoinRequests(workspaceId: string): Promise<JoinRequestOut[]> {
  return apiFetch<JoinRequestOut[]>(`/api/v1/workspaces/${workspaceId}/join-requests`);
}

export function approveJoinRequest(
  workspaceId: string,
  requestId: string,
  role: WorkspaceMemberRole = "member",
): Promise<MemberOut> {
  return apiFetch<MemberOut>(`/api/v1/workspaces/${workspaceId}/join-requests/${requestId}/approve`, {
    method: "POST",
    body: JSON.stringify({ role }),
  });
}

export function rejectJoinRequest(workspaceId: string, requestId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/workspaces/${workspaceId}/join-requests/${requestId}/reject`, {
    method: "POST",
  });
}

/** The link that opens the Join page with a code already filled in. */
export function joinLink(roomCode: string): string {
  return `${window.location.origin}/join?code=${encodeURIComponent(roomCode)}`;
}
