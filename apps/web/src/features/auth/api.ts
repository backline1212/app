import type { Schemas } from "@backline/types";

import { apiFetch } from "../../lib/api-client";

export type UserOut = Schemas["UserOut"];
export type TokenPairOut = Schemas["TokenPairOut"];
export type AccessTokenOut = Schemas["AccessTokenOut"];

export function requestOtp(email: string): Promise<void> {
  return apiFetch<void>("/api/v1/auth/otp/request", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function verifyOtp(email: string, code: string): Promise<TokenPairOut> {
  return apiFetch<TokenPairOut>("/api/v1/auth/otp/verify", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });
}

export function signup(name: string, email: string, password: string): Promise<TokenPairOut> {
  return apiFetch<TokenPairOut>("/api/v1/auth/signup", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
}

export function loginWithPassword(email: string, password: string): Promise<TokenPairOut> {
  return apiFetch<TokenPairOut>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function exchangeGoogleCode(code: string): Promise<TokenPairOut> {
  return apiFetch<TokenPairOut>("/api/v1/auth/google/callback", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export function switchWorkspace(workspaceId: string): Promise<AccessTokenOut> {
  return apiFetch<AccessTokenOut>("/api/v1/auth/switch-workspace", {
    method: "POST",
    body: JSON.stringify({ workspace_id: workspaceId }),
  });
}

export function logout(): Promise<void> {
  return apiFetch<void>("/api/v1/auth/logout", { method: "POST" });
}

export function refreshSession(): Promise<TokenPairOut> {
  return apiFetch<TokenPairOut>("/api/v1/auth/refresh", { method: "POST" });
}

export type UserPreferencesOut = Schemas["UserPreferencesOut"];
export type UserUpdateRequest = Schemas["UserUpdateRequest"];
export type UserOutWithPrefs = UserOut;

export function updateProfile(updates: UserUpdateRequest): Promise<UserOutWithPrefs> {
  return apiFetch<UserOutWithPrefs>("/api/v1/auth/me", {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

// Plain "SessionOut" again since the second, duplicate SessionOut (the removed
// modules/auth/account router) stopped being part of the schema - openapi-typescript
// only qualifies a name by its Python module path while two of them collide.
export type SessionOut = Schemas["SessionOut"];

export function listSessions(): Promise<SessionOut[]> {
  return apiFetch<SessionOut[]>("/api/v1/auth/sessions", { method: "GET" });
}

export function revokeSession(familyId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/auth/sessions/${familyId}`, { method: "DELETE" });
}
