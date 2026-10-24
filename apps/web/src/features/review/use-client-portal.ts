import { useQuery } from "@tanstack/react-query";

import { API_BASE_URL } from "../../lib/api-client";
import type { PublicBranding } from "../workspaces/branding-api";

// The dashboard's own hosts never resolve as a client portal; skip the lookup there.
function maybeCustomDomain(): boolean {
  const host = window.location.hostname;
  return !(host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app") || host.endsWith(".railway.app"));
}

/** Branding for a verified custom review domain (Settings › Review domain), or null. */
export function useClientPortal(): { loading: boolean; branding: PublicBranding | null } {
  const enabled = maybeCustomDomain();
  const query = useQuery({
    queryKey: ["client-portal", window.location.hostname],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/branding/by-host?host=${encodeURIComponent(window.location.hostname)}`, { credentials: "omit" });
      if (!response.ok) return null;
      return (await response.json()) as PublicBranding | null;
    },
    enabled,
    staleTime: Infinity,
    retry: false,
  });
  return { loading: enabled && query.isLoading, branding: query.data ?? null };
}

