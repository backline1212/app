import type { Schemas } from "@backline/types";

import { apiFetch } from "../../lib/api-client";

export type WorkspaceOut = Schemas["WorkspaceOut"];
export type MemberOut = Schemas["MemberOut"];
export type JoinRequestOut = Schemas["JoinRequestOut"];
export type JoinRequestResponse = Schemas["JoinRequestResponse"];

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

export function updateWorkspace(workspaceId: string, update: { name?: string; room_code?: string; join_requires_approval?: boolean }): Promise<WorkspaceOut> {
  return apiFetch<WorkspaceOut>(`/api/v1/workspaces/${workspaceId}`, {
    method: "PATCH",
    body: JSON.stringify(update),
  });
}

export function listMembers(workspaceId: string): Promise<MemberOut[]> {
  return apiFetch<MemberOut[]>(`/api/v1/workspaces/${workspaceId}/members`);
}

export function inviteMember(
  workspaceId: string,
  email: string,
  role: "admin" | "member",
): Promise<MemberOut> {
  return apiFetch<MemberOut>(`/api/v1/workspaces/${workspaceId}/members/invite`, {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
}

export function updateMemberRole(
  workspaceId: string,
  memberId: string,
  role: "admin" | "member",
): Promise<void> {
  return apiFetch<void>(`/api/v1/workspaces/${workspaceId}/members/${memberId}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export function removeMember(workspaceId: string, memberId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/workspaces/${workspaceId}/members/${memberId}`, {
    method: "DELETE",
  });
}

export function submitJoinRequest(roomCode: string): Promise<JoinRequestResponse> {
  return apiFetch<JoinRequestResponse>("/api/v1/workspaces/join", {
    method: "POST",
    body: JSON.stringify({ room_code: roomCode }),
  });
}

export function listJoinRequests(workspaceId: string): Promise<JoinRequestOut[]> {
  return apiFetch<JoinRequestOut[]>(`/api/v1/workspaces/${workspaceId}/join-requests`);
}

export function approveJoinRequest(workspaceId: string, requestId: string): Promise<MemberOut> {
  return apiFetch<MemberOut>(`/api/v1/workspaces/${workspaceId}/join-requests/${requestId}/approve`, {
    method: "POST",
  });
}

export function rejectJoinRequest(workspaceId: string, requestId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/workspaces/${workspaceId}/join-requests/${requestId}/reject`, {
    method: "POST",
  });
}
