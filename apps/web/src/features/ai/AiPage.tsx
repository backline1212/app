import { useQuery } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import { LoadingScreen } from "../../components/LoadingScreen";
import { qk } from "../../lib/query-keys";
import { useDocumentTitle } from "../../lib/use-document-title";
import type { WorkspaceOut } from "../workspaces/api";
import { getDashboard } from "../tickets/api";

// The AI capabilities live in the comment thread panel (CommentThreadPanel) and project
// overview (ProjectOverviewPage). This page gives workspace members a single place to see
// what AI features are available and how they work, without having to discover them
// inline first.

const CAPABILITIES = [
  {
    title: "Thread Summarization",
    description:
      "Get a one-paragraph summary of a long comment thread. Available from the AI button in any comment's detail drawer.",
    status: "Active",
  },
  {
    title: "Reply Suggestions",
    description:
      "Generate up to three contextual reply drafts that you can send, edit, or discard. Also available from the comment drawer.",
    status: "Active",
  },
  {
    title: "Project Analysis",
    description:
      "Automatically categorize and prioritize open feedback for a project. Accessible from the project overview page.",
    status: "Active",
  },
] as const;

export function AiPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceOut }>();
  useDocumentTitle([workspace.name, "AI"]);

  const dashboard = useQuery({
    queryKey: qk.dashboard(workspace.id),
    queryFn: () => getDashboard(workspace.id),
  });

  return (
    <main className="bl-wrap">
      <header className="bl-head">
        <div>
          <h1>AI</h1>
          <p>
            Accelerate your review workflow. AI summarizes threads, suggests
            replies, and analyzes project feedback automatically.
          </p>
        </div>
      </header>

      {dashboard.isLoading && <LoadingScreen inline />}

      <section className="bl-attention bl-settings-section">
        <header>
          <h2>Capabilities</h2>
          <span>Features available in your workspace right now.</span>
        </header>
        <div className="bl-ai-capabilities">
          {CAPABILITIES.map((cap) => (
            <article key={cap.title} className="bl-ai-cap">
              <div className="bl-ai-cap-head">
                <strong>{cap.title}</strong>
                <span className="bl-chip">{cap.status}</span>
              </div>
              <p className="bl-mono">{cap.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bl-attention bl-settings-section">
        <header>
          <h2>Configuration</h2>
        </header>
        <div style={{ flex: 1, padding: "20px" }}>
          <p className="bl-mono">
            AI features are powered by high-performance language models
            configured at the server level. Contact your workspace administrator
            to change the model or manage API key rotation.
          </p>
          <div
            className="bl-inline-note"
            style={{ marginTop: "12px" }}
          >
            <strong>Model:</strong> Configured by environment variable
            <code style={{ marginLeft: "6px", padding: "2px 5px", borderRadius: "3px", background: "var(--paper)", fontSize: "12px" }}>GROQ_MODEL</code>
          </div>
        </div>
      </section>

      <section className="bl-attention bl-settings-section">
        <header>
          <h2>Usage</h2>
        </header>
        <div style={{ flex: 1, padding: "20px" }}>
          <p className="bl-mono">
            AI actions count against your plan's monthly allowance. When the
            limit is reached, AI features pause until the next billing cycle.
          </p>
          <div style={{ marginTop: "10px", display: "flex", gap: "16px", flexWrap: "wrap" }}>
            <div className="bl-stat">
              <span className="bl-stat-value">{dashboard.data?.projects ?? "—"}</span>
              <span className="bl-stat-label">Projects</span>
            </div>
            <div className="bl-stat">
              <span className="bl-stat-value">{dashboard.data?.tickets ?? "—"}</span>
              <span className="bl-stat-label">Total tickets</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
