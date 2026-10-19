import { useEffect, useState } from "react";

type LinkPolicy = { revoked_at: string | null; expires_at: string | null };

export function reviewLinkState(link: LinkPolicy, now = Date.now()): "active" | "expired" | "revoked" {
  if (link.revoked_at) return "revoked";
  if (link.expires_at && (!Number.isFinite(Date.parse(link.expires_at)) || Date.parse(link.expires_at) <= now)) return "expired";
  return "active";
}

/** Keep expiry labels accurate while a share dialog stays open or regains focus. */
export function useReviewLinkClock(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 15_000);
    window.addEventListener("focus", update);
    return () => { clearInterval(timer); window.removeEventListener("focus", update); };
  }, []);
  return now;
}
