import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

import { WORKSPACE_ACCESS_LOST_EVENT } from "../../lib/api-client";
import { getAccessToken, onAccessTokenChange, setAccessToken } from "../../lib/auth-token";
import { decodeAccessToken } from "../../lib/jwt";
import { qk } from "../../lib/query-keys";
import * as authApi from "./api";
import type { SignupChallengeOut, UserOut } from "./api";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  status: AuthStatus;
  user: UserOut | null;
  workspaceId: string | null;
  role: string | null;
  featureFlags: Record<string, boolean>;
  signup: (name: string, email: string, password: string) => Promise<SignupChallengeOut>;
  verifySignup: (name: string, email: string, password: string, code: string) => Promise<void>;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  requestOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, code: string) => Promise<void>;
  setPassword: (password: string) => Promise<void>;
  loginWithGoogleCode: (code: string, state: string) => Promise<void>;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: UserOut) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<UserOut | null>(null);
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({});
  // Bumped on every access-token change purely to force a re-render; decoding a JWT
  // payload is cheap enough that it doesn't need useMemo, so there's no dependency
  // array to keep in sync with it.
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    let previous = decodeAccessToken(getAccessToken() ?? "");
    return onAccessTokenChange((token) => {
      const next = decodeAccessToken(token ?? "");
      const contextChanged = !next || previous?.sub !== next.sub || previous?.workspace_id !== next.workspace_id;
      if (contextChanged || previous?.role !== next?.role) {
        // Cancel in-flight queries and discard data from a prior identity/context.
        // This also covers expiry and access loss, not only an explicit logout.
        queryClient.clear();
        if (contextChanged) setFeatureFlags({});
      }
      previous = next;
      forceUpdate((v) => v + 1);
    });
  }, [queryClient]);
  // Removed from the open workspace: reloading the workspace list drops it, and the
  // workspace layout then routes to the picker instead of failing every request.
  useEffect(() => {
    const reload = () => void queryClient.invalidateQueries({ queryKey: qk.workspaces() });
    window.addEventListener(WORKSPACE_ACCESS_LOST_EVENT, reload);
    return () => window.removeEventListener(WORKSPACE_ACCESS_LOST_EVENT, reload);
  }, [queryClient]);

  const currentToken = getAccessToken();
  const payload = currentToken ? decodeAccessToken(currentToken) : null;

  useEffect(() => {
    if (status === "authenticated" && !currentToken) {
      setStatus("unauthenticated");
      setUser(null);
    }
  }, [currentToken, status]);

  useEffect(() => {
    // Access tokens live in memory only (13-Authentication.md §13.6), so a page reload
    // loses them - try to silently restore a session from the httpOnly refresh cookie.
    let cancelled = false;
    authApi
      .refreshSession()
      .then((result) => {
        // The API client already installed this token. A login or logout may have
        // completed while startup restoration waited; do not overwrite that state.
        if (cancelled || getAccessToken() !== result.access_token) return;
        setUser(result.user);
        setStatus("authenticated");
      })
      .catch(() => {
        if (cancelled || getAccessToken()) return;
        setStatus("unauthenticated");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value: AuthContextValue = {
    status,
    user,
    workspaceId: payload?.workspace_id ?? null,
    role: payload?.role ?? null,
    featureFlags,
    async signup(name, email, password) {
      return authApi.signup(name, email, password);
    },
    async verifySignup(name, email, password, code) {
      const result = await authApi.verifySignup(name, email, password, code);
      setAccessToken(result.access_token);
      setUser(result.user);
      setStatus("authenticated");
    },
    async loginWithPassword(email, password) {
      const result = await authApi.loginWithPassword(email, password);
      setAccessToken(result.access_token);
      setUser(result.user);
      setStatus("authenticated");
    },
    async requestOtp(email) {
      await authApi.requestOtp(email);
    },
    async verifyOtp(email, code) {
      const result = await authApi.verifyOtp(email, code);
      setAccessToken(result.access_token);
      setUser(result.user);
      setStatus("authenticated");
    },
    async setPassword(password) {
      await authApi.setPassword(password);
    },
    async loginWithGoogleCode(code, state) {
      const result = await authApi.exchangeGoogleCode(code, state);
      setAccessToken(result.access_token);
      setUser(result.user);
      setStatus("authenticated");
    },
    async switchWorkspace(workspaceId) {
      const result = await authApi.switchWorkspace(workspaceId);
      setAccessToken(result.access_token);
      setFeatureFlags(result.feature_flags ?? {});
    },
    async logout() {
      await authApi.logout().catch(() => undefined);
      setAccessToken(null);
      setUser(null);
      setStatus("unauthenticated");
      // Without this, a stale cache (other members' names, the previous workspace's
      // data) can flash on next render or leak into whoever logs in next in this same
      // tab - the access token is gone but every useQuery result stays in memory.
      queryClient.clear();
    },
    updateUser(u) {
      setUser(u);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// The useAuth hook belongs next to the context/provider it reads, not split into its
// own file for one export.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

// 18-Storage-Deployment.md §18.7: "backed by a value returned in the auth/bootstrap
// response, not a separate polled endpoint" - reads the flags switchWorkspace already
// fetched, no request of its own.
// eslint-disable-next-line react-refresh/only-export-components
export function useFeatureFlag(key: string): boolean {
  return useAuth().featureFlags[key] ?? false;
}
