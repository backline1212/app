import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckIcon, XIcon } from "../../components/icons";
import { qk } from "../../lib/query-keys";
import { listIntegrations } from "../integrations/api";
import type * as api from "./api";

// A new workspace's next steps, ticked from what has really happened (TDR-0236): a
// first-time owner used to land on the sample project with nothing saying what to do
// next. Hidden once the three main steps are done, or when dismissed (this browser).
export function GetStartedCard({
  workspace,
  projects,
  stats,
  memberCount,
  onNewProject,
}: {
  workspace: { id: string; slug: string };
  projects: api.ProjectOut[] | undefined;
  stats: Map<string, { total: number }>;
  memberCount: number | undefined;
  onNewProject: () => void;
}) {
  const dismissKey = `backline:get-started-dismissed:${workspace.id}`;
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(dismissKey) === "1"; } catch { return false; }
  });
  const integrations = useQuery({ queryKey: qk.integrations(workspace.id), queryFn: () => listIntegrations(workspace.id), enabled: !dismissed });
  if (dismissed || !projects || memberCount === undefined) return null;

  const real = projects.filter((project) => !project.is_sample && !project.archived_at);
  const firstReal = real[0];
  const steps = [
    {
      done: real.length > 0,
      title: "Add a project for a client",
      detail: "A website URL, images, app screens or a PDF.",
      action: <button type="button" className="bl-quiet" onClick={onNewProject}>New project</button>,
    },
    {
      done: real.some((project) => (stats.get(project.id)?.total ?? 0) > 0),
      title: "Get your first feedback",
      detail: "Send the review link; the client comments without an account.",
      action: firstReal
        ? <Link className="bl-quiet" to={`/w/${workspace.slug}/p/${firstReal.id}/share-links`}>Review links</Link>
        : null,
    },
    {
      done: memberCount > 1,
      title: "Invite a teammate",
      detail: "Assign feedback and reply together.",
      action: <Link className="bl-quiet" to={`/w/${workspace.slug}/members?invite=email`}>Invite</Link>,
    },
    {
      done: (integrations.data?.length ?? 0) > 0,
      optional: true,
      title: "Connect Slack, Jira or GitHub",
      detail: "New feedback posts where your team already works.",
      action: <Link className="bl-quiet" to={`/w/${workspace.slug}/integrations`}>Integrations</Link>,
    },
  ];
  const required = steps.filter((step) => !step.optional);
  if (required.every((step) => step.done)) return null;
  const doneCount = steps.filter((step) => step.done).length;

  function dismiss() {
    setDismissed(true);
    try { localStorage.setItem(dismissKey, "1"); } catch { /* storage blocked: hidden for this visit */ }
  }

  return (
    <section className="bl-get-started" aria-labelledby="bl-get-started-title">
      <header>
        <div>
          <h2 id="bl-get-started-title">Get started</h2>
          <p>{doneCount} of {steps.length} done</p>
        </div>
        <button type="button" className="bl-icon" aria-label="Hide Get started" title="Hide" onClick={dismiss}><XIcon /></button>
      </header>
      <div className="bl-get-started-bar" aria-hidden="true"><i style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
      <ol>
        {steps.map((step) => (
          <li key={step.title} className={step.done ? "is-done" : ""}>
            <span className="bl-get-started-mark" aria-hidden="true">{step.done ? <CheckIcon width={13} height={13} /> : null}</span>
            <span className="bl-get-started-copy">
              <strong>{step.title}{step.optional && <em> Optional</em>}</strong>
              <small>{step.detail}</small>
            </span>
            {step.done ? <span className="bl-get-started-done">Done</span> : step.action}
          </li>
        ))}
      </ol>
    </section>
  );
}
