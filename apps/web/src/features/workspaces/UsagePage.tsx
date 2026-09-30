import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useOutletContext } from "react-router-dom";

import { LoadingScreen } from "../../components/LoadingScreen";
import { UsageChartArt } from "../../components/illustrations";
import { qk } from "../../lib/query-keys";
import { useDocumentTitle } from "../../lib/use-document-title";
import { getAiUsage, type AiUsageOut } from "../billing/api";
import type { WorkspaceOut } from "./api";

const ACTION_LABELS: Record<AiUsageOut["by_action"][number]["action"], string> = {
  summarize: "Thread summaries",
  suggest_reply: "Suggested replies",
  analyze_project: "BugHunt AI analyses",
};

type Point = AiUsageOut["daily"][number];

// "2026-09-04" / "2026-09" are UTC periods; formatted in UTC so a viewer west of
// Greenwich doesn't see every day shifted to the one before.
function periodDate(period: string): Date {
  return new Date(period.length === 7 ? `${period}-01T00:00:00Z` : `${period}T00:00:00Z`);
}

function dayLabel(period: string): string {
  return periodDate(period).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
}

function monthLabel(period: string): string {
  return periodDate(period).toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" });
}

function credits(count: number): string {
  return `${count.toLocaleString()} credit${count === 1 ? "" : "s"}`;
}

/** One series of counts as thin columns on one baseline (single hue, no legend - the
 * heading names the series). Hovering or focusing a column shows its value; the same
 * numbers are in the table under the chart. */
function ColumnChart({ points, label, format }: { points: Point[]; label: string; format: (period: string) => string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...points.map((p) => p.count));
  const peak = points.reduce<Point | null>((best, p) => (p.count > (best?.count ?? 0) ? p : best), null);
  const shown = active === null ? null : points[active];
  return (
    <figure className="bl-colchart" onMouseLeave={() => setActive(null)}>
      <div className="bl-colchart-head" aria-live="polite">
        {shown ? <><b>{credits(shown.count)}</b><span>{format(shown.period)}</span></> : peak ? <><b>{credits(peak.count)}</b><span>busiest: {format(peak.period)}</span></> : <span>No credits used in this range</span>}
      </div>
      <div className="bl-colchart-plot" role="group" aria-label={label}>
        <span className="bl-colchart-max" aria-hidden="true">{max.toLocaleString()}</span>
        {points.map((p, index) => (
          <button
            type="button"
            key={p.period}
            className={`bl-colchart-col${active === index ? " is-active" : ""}`}
            aria-label={`${format(p.period)}: ${credits(p.count)}`}
            onMouseEnter={() => setActive(index)}
            onFocus={() => setActive(index)}
            onBlur={() => setActive(null)}
          >
            {p.count > 0 && <i style={{ height: `${(p.count / max) * 100}%` }} />}
          </button>
        ))}
      </div>
      <figcaption className="bl-colchart-axis" aria-hidden="true">
        <span>{format(points[0].period)}</span>
        <span>{format(points[points.length - 1].period)}</span>
      </figcaption>
      <details className="bl-colchart-table">
        <summary>Show as a table</summary>
        <table className="bl-table">
          <thead><tr><th scope="col">Period</th><th scope="col">Credits</th></tr></thead>
          <tbody>{points.map((p) => <tr key={p.period}><td>{format(p.period)}</td><td>{p.count.toLocaleString()}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  );
}

export function UsagePage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceOut }>();
  useDocumentTitle([workspace.name, "AI Usage"]);
  const usage = useQuery({ queryKey: qk.aiUsage(workspace.id), queryFn: () => getAiUsage(workspace.id) });
  const data = usage.data;
  const pct = data ? Math.min(100, Math.round((data.used / Math.max(1, data.limit)) * 100)) : 0;
  const tone = data && data.used >= data.limit ? " is-full" : pct >= 80 ? " is-high" : "";
  const resets = data ? new Date(data.resets_at).toLocaleDateString(undefined, { day: "numeric", month: "long", timeZone: "UTC" }) : "";
  const maxAction = Math.max(1, ...(data?.by_action.map((a) => a.count) ?? []));

  return (
    <main className="bl-wrap">
      <header className="bl-head">
        <div>
          <h1>AI Usage</h1>
          <p>Each thread summary, set of suggested replies and BugHunt AI analysis uses one credit from your plan's monthly allowance.</p>
        </div>
      </header>

      {usage.isLoading && <LoadingScreen inline />}
      {usage.error && (
        <p role="alert" className="bl-error">
          {usage.error.message} <button type="button" className="bl-quiet" onClick={() => void usage.refetch()}>Try again</button>
        </p>
      )}

      {data && (
        <>
          {!data.ai_enabled && (
            <p className="bl-inline-note bl-usage-note">
              AI isn't connected on this server, so AI features give placeholder answers that don't use credits.
            </p>
          )}

          <section className="bl-usage-card bl-usage-grid bl-usage-tiles" aria-label="This month">
            <div className="bl-usage">
              <p><span>AI credits this month</span><b>{data.used.toLocaleString()} / {data.limit.toLocaleString()}</b></p>
              <div
                className={`bl-usage-bar${tone}`}
                role="progressbar"
                aria-label="AI credits used this month"
                aria-valuemin={0}
                aria-valuemax={data.limit}
                aria-valuenow={data.used}
                aria-valuetext={`${data.used} of ${data.limit}`}
              >
                <i style={{ width: `${pct}%` }} />
              </div>
              <small>
                {data.used >= data.limit
                  ? "All used. AI features pause until the reset, or upgrade for more."
                  : `${(data.limit - data.used).toLocaleString()} left`}
              </small>
            </div>
            <div className="bl-usage">
              <p><span>Resets</span><b>{resets}</b></p>
              <small>Credits reset on the 1st of each month (UTC). Unused credits don't carry over.</small>
            </div>
            <div className="bl-usage">
              <p><span>Plan</span><b>{data.plan_name}</b></p>
              <small><Link to={`/w/${workspace.slug}/billing`}>Compare plans</Link> for a larger allowance.</small>
            </div>
          </section>

          {data.used === 0 && data.monthly.every((m) => m.count === 0) ? (
            <section className="bl-usage-card">
              <div className="bl-usage-empty">
                <UsageChartArt />
                <h2>No AI credits used yet</h2>
                <p>Summarize a thread, ask for suggested replies, or run BugHunt AI on a project, and it shows up here.</p>
              </div>
            </section>
          ) : (
            <>
              <section className="bl-usage-card">
                <header><h2>This month, by day</h2></header>
                <ColumnChart points={data.daily} label="AI credits used per day this month" format={dayLabel} />
              </section>

              <div className="bl-usage-split">
                <section className="bl-usage-card">
                  <header><h2>By feature</h2></header>
                  <ul className="bl-hbars">
                    {data.by_action.map((a) => (
                      <li key={a.action}>
                        <span>{ACTION_LABELS[a.action]}</span>
                        <span className="bl-hbar-track" aria-hidden="true">{a.count > 0 && <i style={{ width: `${(a.count / maxAction) * 100}%` }} />}</span>
                        <b>{a.count.toLocaleString()}</b>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="bl-usage-card">
                  <header><h2>By member</h2></header>
                  {data.by_member.length === 0 ? (
                    <p className="bl-usage-none">Nobody has used AI this month.</p>
                  ) : (
                    <table className="bl-table">
                      <thead><tr><th scope="col">Member</th><th scope="col" className="bl-col-num">Credits</th></tr></thead>
                      <tbody>
                        {data.by_member.map((m) => (
                          <tr key={m.user_id ?? "untracked"}><td>{m.name}</td><td className="bl-col-num">{m.count.toLocaleString()}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>
              </div>

              <section className="bl-usage-card">
                <header><h2>Last six months</h2></header>
                <ColumnChart points={data.monthly} label="AI credits used per month, last six months" format={monthLabel} />
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}
