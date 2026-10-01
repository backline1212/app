import { useQuery } from "@tanstack/react-query";
import type { ComponentType, SVGProps } from "react";
import { Link, useOutletContext } from "react-router-dom";

import { AiSummaryArt } from "../../components/illustrations";
import { LoadingScreen } from "../../components/LoadingScreen";
import { qk } from "../../lib/query-keys";
import { useDocumentTitle } from "../../lib/use-document-title";
import { CommentBubbleIcon, SearchIcon } from "../../components/icons";
import { SparklesIcon } from "../../app/layout/sidebar-icons";
import { getAiUsage, type AiUsageOut } from "../billing/api";
import type { WorkspaceOut } from "../workspaces/api";

type AiAction = AiUsageOut["by_action"][number]["action"];

// Where each AI action lives in the product, so a member can find it without
// discovering it inline first. Counts and availability come from the same
// /billing/ai-usage ledger the plan limit is enforced from (billing/limits.py), so this
// page cannot disagree with what actually happens when a button is pressed.
const CAPABILITIES: {
  action: AiAction;
  title: string;
  description: string;
  where: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}[] = [
  {
    action: "summarize",
    title: "Thread summaries",
    description: "Condenses a long comment thread into a short paragraph: what was asked, what changed and what is still open.",
    where: "Open a project's ticket board, open a ticket, then choose Summarize.",
    icon: SparklesIcon,
  },
  {
    action: "suggest_reply",
    title: "Suggested replies",
    description: "Drafts a reply from the thread's context. Send it as it is, edit it first, or throw it away.",
    where: "In any comment's detail, choose “Write a reply for me”. On the board, choose Suggest Replies.",
    icon: CommentBubbleIcon,
  },
  {
    action: "analyze_project",
    title: "BugHunt AI",
    description: "Reads every open comment in a project, ranks the issues by severity and flags likely duplicates.",
    where: "Open a project and choose BugHunt AI in the side panel.",
    icon: SearchIcon,
  },
];

type Availability = { label: string; tone: "ready" | "paused" | "off" };

function availability(data: AiUsageOut): Availability {
  if (!data.ai_enabled) return { label: "Not connected", tone: "off" };
  if (data.used >= data.limit) return { label: "Paused", tone: "paused" };
  return { label: "Ready", tone: "ready" };
}

export function AiPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceOut }>();
  useDocumentTitle([workspace.name, "AI"]);
  const usage = useQuery({ queryKey: qk.aiUsage(workspace.id), queryFn: () => getAiUsage(workspace.id) });
  const data = usage.data;

  const counts = new Map(data?.by_action.map((row) => [row.action, row.count]));
  const state = data ? availability(data) : null;
  const pct = data ? Math.min(100, Math.round((data.used / Math.max(1, data.limit)) * 100)) : 0;
  const tone = data && data.used >= data.limit ? " is-full" : pct >= 80 ? " is-high" : "";
  const resets = data
    ? new Date(data.resets_at).toLocaleDateString(undefined, { day: "numeric", month: "long", timeZone: "UTC" })
    : "";

  return (
    <main className="bl-wrap bl-ai">
      <header className="bl-head">
        <div>
          <h1>AI</h1>
          <p>
            Summaries, reply drafts and BugHunt AI analyses, built from your team&apos;s real review threads.
            Each one uses one credit from your plan&apos;s monthly allowance.
          </p>
        </div>
      </header>

      {usage.error && (
        <p role="alert" className="bl-error">
          {usage.error.message}{" "}
          <button type="button" className="bl-quiet" onClick={() => void usage.refetch()}>Try again</button>
        </p>
      )}

      <section className="bl-ai-hero" aria-label="AI credits this month">
        <AiSummaryArt />
        <div className="bl-ai-meter">
          {usage.isLoading && <LoadingScreen inline />}
          {data && state && (
            <>
              <p className="bl-ai-meter-top">
                <span>AI credits this month</span>
                <span className={`bl-ai-state is-${state.tone}`}>{state.label}</span>
              </p>
              <p className="bl-ai-meter-count">
                <b>{data.used.toLocaleString()}</b> of {data.limit.toLocaleString()} used
              </p>
              <div
                className={`bl-usage-bar${tone}`}
                role="progressbar"
                aria-label="AI credits used this month"
                aria-valuemin={0}
                aria-valuemax={data.limit}
                aria-valuenow={Math.min(data.used, data.limit)}
                aria-valuetext={`${data.used} of ${data.limit}`}
              >
                <i style={{ width: `${pct}%` }} />
              </div>
              <small>
                {!data.ai_enabled
                  ? "AI isn't connected on this server, so AI features give placeholder answers that don't use credits."
                  : data.used >= data.limit
                    ? `All used. AI features pause until ${resets}, or upgrade for more.`
                    : `${(data.limit - data.used).toLocaleString()} left on the ${data.plan_name} plan. Resets ${resets}.`}
              </small>
              <div className="bl-ai-meter-links">
                <Link to={`/w/${workspace.slug}/usage`}>Usage by feature and member</Link>
                <Link to={`/w/${workspace.slug}/billing`}>Compare plans</Link>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="bl-ai-grid" aria-label="What AI can do">
        {CAPABILITIES.map((cap) => {
          const count = counts.get(cap.action);
          return (
            <article key={cap.action} className="bl-ai-cap">
              <header>
                <span className="bl-ai-cap-icon" aria-hidden="true"><cap.icon /></span>
                <h2>{cap.title}</h2>
              </header>
              <p>{cap.description}</p>
              <p className="bl-ai-where">{cap.where}</p>
              <footer>
                <b>{count === undefined ? "—" : count.toLocaleString()}</b>
                <span>{count === 1 ? "credit" : "credits"} used this month</span>
              </footer>
            </article>
          );
        })}
      </section>

      <p className="bl-ai-foot">
        Want an agent to work on tickets from your editor? Connect it through the{" "}
        <Link to={`/w/${workspace.slug}/mcp`}>MCP server</Link>. AI actions there run in your own tool and
        don&apos;t use Backline credits.
      </p>
    </main>
  );
}
