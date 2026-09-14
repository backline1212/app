import { useDocumentTitle } from "../../lib/use-document-title";
import { ChartIcon } from "../projects/panel/icons";

const CHECKS = [
  "Per-member and per-workspace AI request counts",
  "Monthly usage trend for summarize/suggest-reply calls",
  "A running tally against your plan's included quota",
];

// Static placeholder only, matching AiTab.tsx's treatment (18-Storage-Deployment.md's
// "zero values are not fabricated" rule) - there is no token accounting or usage ledger
// yet, so this page must not imply real numbers are one click away.
export function UsagePage() {
  useDocumentTitle("AI Usage");
  return (
    <main className="bl-wrap">
      <header className="bl-head">
        <div>
          <h1>AI Usage</h1>
          <p>AI usage tracking is not available yet.</p>
        </div>
      </header>

      <section className="bl-attention bl-settings-section">
        <div
          className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center"
          style={{ padding: "40px 24px" }}
        >
          <span
            style={{
              display: "flex",
              width: 56,
              height: 56,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 3,
              background: "var(--ink)",
              color: "var(--mint)",
            }}
          >
            <ChartIcon width={26} height={26} />
          </span>
          <div>
            <h3 className="text-lg font-semibold">Usage tracking</h3>
            <span className="bl-scope-badge" style={{ marginTop: 6, display: "inline-flex" }}>
              Coming soon
            </span>
          </div>
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
            Backline has no configured AI provider, analysis jobs, token accounting, or usage
            ledger. Metrics will appear here only after those server-side contracts exist; zero
            values are not fabricated in the meantime.
          </p>
        </div>
      </section>
    </main>
  );
}
