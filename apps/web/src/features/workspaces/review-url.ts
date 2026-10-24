import { useQuery } from "@tanstack/react-query";
import { qk } from "../../lib/query-keys";
import { getBranding } from "./branding-api";

/** A client review link, on the workspace's verified review domain when it has one. */
export function reviewLinkUrl(token: string, reviewDomain?: string | null): string {
  return `${reviewDomain ? `https://${reviewDomain}` : window.location.origin}/review/${token}`;
}

/** The workspace's live review domain (Settings › Review domain), or null. */
export function useReviewDomain(workspaceId: string | undefined): string | null {
  const branding = useQuery({ queryKey: qk.branding(workspaceId), queryFn: () => getBranding(workspaceId!), enabled: Boolean(workspaceId), staleTime: 5 * 60_000 });
  return branding.data?.review_domain ?? null;
}
