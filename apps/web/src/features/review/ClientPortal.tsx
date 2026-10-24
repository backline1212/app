import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { PublicBranding } from "../workspaces/branding-api";

/** The landing page of a workspace's own review domain: clients arrive with a review
 * link, so there's no sign-in here - just the agency's brand and where to paste it. */
export function ClientPortalLanding({ branding }: { branding: PublicBranding }) {
  const navigate = useNavigate();
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (branding.display_name) document.title = `${branding.display_name} reviews`;
    if (!branding.accent_color) return;
    const root = document.documentElement;
    root.style.setProperty("--bl-brand-accent", branding.accent_color);
    root.classList.add("bl-branded");
    return () => { root.style.removeProperty("--bl-brand-accent"); root.classList.remove("bl-branded"); };
  }, [branding]);
  function open(event: FormEvent) {
    event.preventDefault();
    const token = link.trim().match(/(?:\/review\/)?([A-Za-z0-9_-]{8,64})\/?$/)?.[1];
    if (!token) { setError("Paste the full review link from your email or message."); return; }
    navigate(`/review/${token}`);
  }
  return <main className="bl-portal">
    <div className="bl-portal-card">
      {branding.logo_url ? <img className="bl-portal-logo" src={branding.logo_url} alt="" /> : <span className="bl-portal-mark" aria-hidden="true">{(branding.display_name ?? "R").slice(0, 1).toUpperCase()}</span>}
      <h1>{branding.display_name ? `${branding.display_name} reviews` : "Client reviews"}</h1>
      <p>Open the review link your team sent you to leave feedback. No account is needed.</p>
      <form onSubmit={open}>
        <input className="bl-input" aria-label="Review link" placeholder="Paste your review link" value={link} onChange={(event) => { setLink(event.target.value); setError(""); }} />
        <button className="bl-button">Open review</button>
      </form>
      {error && <p role="alert" className="bl-error">{error}</p>}
      {branding.support_email && <p className="bl-portal-help">Need help? <a href={`mailto:${branding.support_email}`}>{branding.support_email}</a></p>}
      {!branding.hide_backline_branding && <p className="bl-portal-powered">Powered by Backline</p>}
    </div>
  </main>;
}
