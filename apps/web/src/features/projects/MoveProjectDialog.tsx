import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Schemas } from "@backline/types";

import { Dialog } from "../../components/Dialog";
import { useToast } from "../../components/Toast";
import { invalidateProjectMutation, qk } from "../../lib/query-keys";
import { listWorkspaces } from "../workspaces/api";
import * as api from "./api";
import { showMoveResult } from "./move-result";

type Preview = Schemas["ProjectTransferPreview"];
type ClientPick = "link" | "contact" | "name" | "none";

interface Choices {
  client: ClientPick | null;
  people: string[];
  keepLinks: boolean;
  copyActivity: boolean;
}

const NO_CHOICES: Choices = { client: null, people: [], keepLinks: true, copyActivity: false };

function hasContact(client: NonNullable<Preview["client"]>) {
  return Boolean(client.contact_name || client.email);
}

/** What is selected for the client until the person picks something else. */
function defaultClient(preview: Preview): ClientPick {
  if (!preview.client) return "none";
  if (preview.existing_client) return "link";
  return hasContact(preview.client) ? "contact" : "name";
}

function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

/** Moves a project, archived or not, to another workspace the person runs (TDR-0243),
 *  showing first what can travel with it (TDR-0245). */
export function MoveProjectDialog({ project, onClose }: { project: api.ProjectOut; onClose: () => void }) {
  const cache = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [targetId, setTargetId] = useState("");
  const [typedName, setTypedName] = useState("");
  const [choices, setChoices] = useState<Choices>(NO_CHOICES);
  const workspaces = useQuery({ queryKey: qk.workspaces(), queryFn: listWorkspaces });
  const destinations = (workspaces.data ?? []).filter((w) => w.id !== project.workspace_id && (w.role === "owner" || w.role === "admin"));
  const target = destinations.find((w) => w.id === targetId);
  const preview = useQuery({
    queryKey: ["project", project.id, "transfer-preview", targetId],
    queryFn: () => api.previewTransfer(project.id, targetId),
    enabled: Boolean(targetId),
    // Seats and clients change elsewhere; ask again each time the dialog is opened.
    staleTime: 0,
    gcTime: 0,
  });
  const data = preview.data;
  const nameMatches = typedName.trim() === project.name.trim();
  const clientPick = choices.client ?? (data ? defaultClient(data) : "none");
  const people = data?.people ?? [];
  const adding = choices.people.filter((id) => people.some((person) => person.user_id === id));
  const freeSeats = data?.member_limit == null ? null : Math.max(0, data.member_limit - data.member_count);
  const tooMany = freeSeats !== null && adding.length > freeSeats;
  const ready = Boolean(data) && nameMatches && !tooMany;

  const move = useMutation({
    mutationFn: () => api.transferProject(project.id, {
      target_workspace_id: targetId,
      project_name: typedName,
      client: clientPick === "link" ? "name" : clientPick,
      client_match: clientPick === "link" ? "existing" : "new",
      add_member_ids: adding,
      keep_issue_links: choices.keepLinks,
      copy_activity: choices.copyActivity,
    }),
    onSuccess: (moved) => {
      const openPath = moved.archived ? `/w/${moved.workspace_slug}?archived=true` : `/w/${moved.workspace_slug}/p/${moved.project_id}`;
      if (moved.unassigned.length > 0 || moved.invite_emails_failed > 0) {
        showMoveResult({ projectName: project.name, openPath, outcome: moved });
      } else {
        toast(`${project.name} moved to ${moved.workspace_name}.`, "success", { action: { label: "Open", onClick: () => navigate(openPath) } });
      }
      const sourceSlug = workspaces.data?.find((w) => w.id === project.workspace_id)?.slug;
      const onThisProject = location.pathname.includes(`/p/${project.id}`);
      onClose();
      // Last: refreshing removes this project's card, and this dialog with it.
      void invalidateProjectMutation(cache, project.workspace_id);
      void invalidateProjectMutation(cache, moved.workspace_id);
      void cache.invalidateQueries({ queryKey: qk.members(moved.workspace_id) });
      // The screen being looked at belongs to a project that is no longer here.
      if (onThisProject && sourceSlug) navigate(`/w/${sourceSlug}`);
    },
  });
  const close = () => { if (!move.isPending) onClose(); };
  const update = (patch: Partial<Choices>) => setChoices((current) => ({ ...current, ...patch }));

  function clientOption(value: ClientPick, label: string, note?: string) {
    return <label className="bl-move-option">
      <input type="radio" name="move-client" disabled={move.isPending} checked={clientPick === value} onChange={() => update({ client: value })} />
      <span>{label}{note && <small>{note}</small>}</span>
    </label>;
  }

  return <Dialog title={`Move “${project.name}” to another workspace`} onClose={close}>
    <form className="bl-compact-form bl-move-form" onSubmit={(event) => { event.preventDefault(); if (ready && !move.isPending) move.mutate(); }}>
      {workspaces.isLoading && <p role="status">Loading your workspaces…</p>}
      {workspaces.error && <p role="alert" className="bl-error">{workspaces.error.message}</p>}
      {workspaces.data && destinations.length === 0
        ? <p>There is nowhere to move it yet. You need to be an owner or admin of a second workspace.</p>
        : <>
          <label>Destination workspace
            <select className="bl-input" required disabled={move.isPending} value={targetId}
              onChange={(event) => { setTargetId(event.target.value); setChoices(NO_CHOICES); move.reset(); }}>
              <option value="" disabled>Choose a workspace…</option>
              {destinations.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </label>
          {preview.isFetching && !data && <p role="status" className="bl-move-line">Checking what can move…</p>}
          {preview.error && <p role="alert" className="bl-error">{preview.error.message} <button type="button" className="bl-quiet" onClick={() => void preview.refetch()}>Try again</button></p>}
          {data && target && <>
            {data.client && <fieldset className="bl-move-set">
              <legend>Client: {data.client.name}</legend>
              {data.existing_client
                ? clientOption("link", `Link to “${data.existing_client.name}” already in ${target.name}`, "Its contact details stay as they are.")
                : null}
              {hasContact(data.client) && clientOption("contact", data.existing_client ? "Add a second client with name and contact" : "Bring the name and contact",
                [data.client.contact_name, data.client.email].filter(Boolean).join(" · "))}
              {clientOption("name", data.existing_client ? "Add a second client with the name only" : "Bring the name only")}
              {clientOption("none", "Don’t bring the client")}
              <p role="status">
                {clientPick === "none" || data.client_shared
                  ? `${data.client.name} stays in this workspace${data.client_shared ? ", where other projects use it" : ""}.`
                  : `${data.client.name} leaves this workspace’s client list, because this is its only project here.`}
              </p>
            </fieldset>}
            {people.length > 0 && <fieldset className="bl-move-set">
              <legend>People not in {target.name}</legend>
              <p>Tick anyone to add as a member, so their tickets stay assigned. They get an invite email and can see projects open to the whole workspace. Everyone left unticked is unassigned.</p>
              {people.map((person) => {
                const ticked = adding.includes(person.user_id);
                return <label key={person.user_id} className="bl-move-option">
                  <input type="checkbox" checked={ticked} disabled={move.isPending || (!ticked && freeSeats !== null && adding.length >= freeSeats)}
                    onChange={() => update({ people: ticked ? adding.filter((id) => id !== person.user_id) : [...adding, person.user_id] })} />
                  <span>{person.name}<small>{person.email} · {plural(person.ticket_count, "ticket")}</small></span>
                </label>;
              })}
              <p role="status" className={tooMany ? "bl-error" : undefined}>
                {data.member_limit == null
                  ? `${target.name} has no member limit.`
                  : freeSeats === 0
                    ? `${target.name} is using all ${data.member_limit} member seats. Upgrade it to add people.`
                    : `${target.name} uses ${data.member_count} of ${data.member_limit} member seats. Adding ${adding.length} leaves ${Math.max(0, (freeSeats ?? 0) - adding.length)} free.`}
              </p>
            </fieldset>}
            {data.issue_link_count > 0 && <label className="bl-move-option">
              <input type="checkbox" disabled={move.isPending} checked={choices.keepLinks} onChange={(event) => update({ keepLinks: event.target.checked })} />
              <span>Keep links to external issues ({data.issue_link_count})<small>Tickets keep showing their issue and cannot be filed twice in the same tracker. {target.name} can see the link addresses; opening one needs access in the tracker. Untick if that team should file its own.</small></span>
            </label>}
            {data.activity_count > 0 && <label className="bl-move-option">
              <input type="checkbox" disabled={move.isPending} checked={choices.copyActivity} onChange={(event) => update({ copyActivity: event.target.checked })} />
              <span>Copy past activity ({plural(data.activity_count, "entry", "entries")})<small>This workspace keeps its record either way. Copying shows {target.name} who did what, including people who are not members there.</small></span>
            </label>}
          </>}
          <div className="bl-move-notes">
            <p><strong>Moves with it:</strong> pages, comments, tickets, ticket history, files and client review links.{project.archived_at ? " It stays archived." : ""}</p>
            <p><strong>Changes:</strong></p>
            <ul>
              <li>Tickets get new numbers.</li>
              <li>People who are not in the destination lose access and are unassigned.</li>
              <li>Project integrations, extension connections and deploy notification addresses need setting up again.</li>
              <li>Notifications about it are cleared.</li>
            </ul>
          </div>
          <label><span>Type <strong>{project.name}</strong> to confirm</span>
            <input className="bl-input" autoComplete="off" disabled={move.isPending} value={typedName} onChange={(event) => setTypedName(event.target.value)} />
          </label>
        </>}
      {move.error && <p role="alert" className="bl-error">{move.error.message}</p>}
      <footer className="bl-dialog-actions">
        <button type="button" className="bl-quiet" disabled={move.isPending} onClick={close}>Cancel</button>
        {destinations.length > 0 && <button className="bl-button" disabled={!ready || move.isPending}>{move.isPending ? "Moving…" : "Move project"}</button>}
      </footer>
    </form>
  </Dialog>;
}
