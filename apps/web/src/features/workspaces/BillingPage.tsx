import { useState } from "react";
import { useOutletContext } from "react-router-dom";

import { useDocumentTitle } from "../../lib/use-document-title";
import { CrownIcon } from "../projects/panel/icons";
import { UpgradeToProModal } from "../projects/panel/UpgradeToProModal";
import type { WorkspaceOut } from "./api";

const CHECKS = [
  "Monthly invoices with a downloadable PDF receipt",
  "Self-serve plan upgrades and downgrades",
  "Server-enforced seat and project limits per plan",
];

// workspace.plan is persisted, but no billing provider or entitlement checks exist.
// This page therefore reports the stored label without inventing limits or pricing.
export function BillingPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceOut }>();
  useDocumentTitle('Billing');
  const [showUpgrade, setShowUpgrade] = useState(false);
  const planLabel = workspace.plan.charAt(0).toUpperCase() + workspace.plan.slice(1);

  return (
    <main className="bl-wrap">
      <header className="bl-head">
        <div>
          <h1>Billing</h1>
          <p>View the stored workspace plan. Billing is not connected yet.</p>
        </div>
      </header>

      <section className="bl-attention bl-settings-section">
        <header>
          <h2>Your Plan</h2>
        </header>
        <div style={{ flex: 1, padding: "20px", display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <p style={{ fontSize: "12px", fontWeight: 500 }}>Current Plan</p>
              <p style={{ fontSize: "24px", fontWeight: 700, margin: "4px 0" }}>{planLabel}</p>
            </div>
            <button
              onClick={() => setShowUpgrade(true)}
              className="bl-button"
            >
              About future plans
            </button>
          </div>
          <div style={{ paddingTop: "20px", borderTop: "1px solid var(--bl-line)" }}>
            <div
              className="flex flex-1 flex-col items-center justify-center gap-5 text-center"
              style={{ padding: "24px 12px" }}
            >
              <span
                style={{
                  display: "flex",
                  width: 48,
                  height: 48,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 3,
                  background: "var(--ink)",
                  color: "var(--mint)",
                }}
              >
                <CrownIcon width={22} height={22} />
              </span>
              <span className="bl-scope-badge" style={{ display: "inline-flex" }}>
                Coming soon
              </span>
              <ul className="flex flex-col gap-3 self-stretch text-left">
                {CHECKS.map((check) => (
                  <li key={check} className="flex items-start gap-2.5 text-sm">
                    <svg
                      viewBox="0 0 20 20"
                      width="18"
                      height="18"
                      fill="none"
                      className="mt-0.5 shrink-0"
                      style={{ color: "var(--mint-deep)" }}
                      aria-hidden="true"
                    >
                      <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
                      <path
                        d="M6 10.5 8.8 13 14 7.5"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    {check}
                  </li>
                ))}
              </ul>
              <p className="bl-inline-note">
                Prices, checkout, invoices, and server-enforced plan limits are coming soon. No
                payment action is available on this page.
              </p>
            </div>
          </div>
        </div>
      </section>

      {showUpgrade && <UpgradeToProModal onClose={() => setShowUpgrade(false)} />}
    </main>
  );
}
