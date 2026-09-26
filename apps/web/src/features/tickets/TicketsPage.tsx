import { useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { useDocumentTitle } from "../../lib/use-document-title";
import { STATUS_LABELS } from "../../lib/workflow";
import { PlusIcon } from "../../components/icons";
import type { WorkspaceOut } from "../workspaces/api";
import type * as api from "./api";
import { TicketBoard } from "./components/TicketBoard";
import { TicketCalendar } from "./components/TicketCalendar";
import { TicketRow } from "./components/TicketRow";
import { TicketTable } from "./components/TicketTable";
import { TicketToolbar } from "./components/TicketToolbar";
import { NewTicket } from "./components/NewTicket";
import { TicketDetail } from "./components/TicketDetail";
import { DeleteTicketDialog } from "./components/DeleteTicket";
import { useTickets } from "./use-tickets";

const VIEW_LAYOUTS = [
  { id: "list", label: "List", icon: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /> },
  { id: "board", label: "Board", icon: <><rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="11" rx="1" /><rect x="17" y="4" width="4" height="7" rx="1" /></> },
  { id: "table", label: "Table", icon: <><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M3 10h18M3 15h18M10 4v16" /></> },
  { id: "calendar", label: "Calendar", icon: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></> },
];

const VIEW_TABS: { key: string; label: string }[] = [
  { key: "all", label: "Everyone" },
  { key: "mine", label: "Assigned to me" },
  { key: "reply", label: "Needs your reply" },
  { key: "client", label: "Waiting on client" },
  { key: "overdue", label: "Overdue" },
];

export function TicketsPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceOut }>();
  const [deleting, setDeleting] = useState<api.Ticket | null>(null);
  useDocumentTitle("Tickets");
  const [params, setParams] = useSearchParams();
  const [showCreate, setShowCreate] = useState(false);

  const {
    query,
    projects,
    members,
    dashboard,
    update,
    exportAll,
    exporting,
    exportError,
    tickets,
    groups,
    set,
    display,
    assignees,
    offset,
  } = useTickets(workspace.id, params, setParams);

  const tabCounts: Record<string, number | undefined> = {
    all: dashboard.data?.tickets,
    mine: dashboard.data?.assigned_to_me,
    reply: dashboard.data?.needs_reply,
    client: dashboard.data?.waiting_on_client,
    overdue: dashboard.data?.overdue,
  };

  const activeFilters: { label: string; onClear: () => void }[] = [
    ...(params.get("status") ? [{ label: STATUS_LABELS[params.get("status") as keyof typeof STATUS_LABELS], onClear: () => set("status", "") }] : []),
    ...(params.get("project_id")
      ? [{ label: projects.data?.find((p) => p.id === params.get("project_id"))?.name ?? "Project", onClear: () => set("project_id", "") }]
      : []),
    ...(params.get("priority") ? [{ label: `${params.get("priority")} priority`, onClear: () => set("priority", "") }] : []),
    ...(params.get("tag") ? [{ label: params.get("tag")!, onClear: () => set("tag", "") }] : []),
    ...assignees.map((a) => ({
      label: a === "unassigned" ? "Unassigned" : (members.data?.find((m) => m.user_id === a)?.name ?? a),
      onClear: () => set("assignee", assignees.filter((x) => x !== a)),
    })),
  ];

  const selected = params.get("comment");
  const sort = params.get("sort") ?? "newest";
  const group = params.get("group") ?? "none";

  return (
    <main className="bl-wrap">
      <header className="bl-head">
        <div>
          <h1>{params.get("view") === "mine" ? "Assigned to me" : "All tickets"}</h1>
          <p>Every comment, plus the work your team raises directly.</p>
        </div>
        <div className="bl-chip-row">
          <button className="bl-quiet" disabled={exporting} onClick={() => void exportAll()}>
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
          <button className="bl-button" onClick={() => setShowCreate(true)}>
            <PlusIcon width={13} height={13} /> New ticket
          </button>
        </div>
      </header>

      <div className="bl-segment bl-ticket-filters" role="group" aria-label="Filter tickets">
        {VIEW_TABS.map((tab) => (
          <button key={tab.key} type="button" aria-pressed={(params.get("view") ?? "all") === tab.key} onClick={() => set("view", tab.key)}>
            {tab.label}
            {tabCounts[tab.key] !== undefined && <span className="bl-count">{tabCounts[tab.key]}</span>}
          </button>
        ))}
      </div>

      {activeFilters.length > 0 && (
        <div className="bl-chip-row" style={{ padding: "0 0 14px" }}>
          <span className="bl-eyebrow" style={{ margin: 0 }}>
            Filtering by:
          </span>
          {activeFilters.map((f) => (
            <button key={f.label} className="bl-chip" onClick={f.onClear} aria-label={`Clear filter ${f.label}`}>
              {f.label} ✕
            </button>
          ))}
        </div>
      )}

      <div className="bl-toolbar">
        <span className="bl-mono">{query.data?.total ?? "—"} TICKETS</span>
        <div className="bl-tool-right">
          <TicketToolbar
            sort={sort}
            onSort={(v) => set("sort", v)}
            group={group}
            onGroup={(v) => set("group", v)}
            showGroup={display === "list" || display === "table"}
            members={members.data ?? []}
            assignees={assignees}
            onAssignees={(v) => set("assignee", v)}
            counts={query.data?.assignee_counts ?? {}}
            totalAny={query.data?.total_any_assignee ?? 0}
          />
          <div className="bl-segment" role="group" aria-label="Ticket layout">
            {VIEW_LAYOUTS.map(({ id, label, icon }) => (
              <button key={id} type="button" aria-pressed={display === id} onClick={() => set("display", id)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icon}</svg>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {query.isLoading && <p role="status">Loading tickets…</p>}
      {[query.error?.message, update.error?.message, exportError].filter(Boolean).map((error) => (
        <p key={error} className="bl-error" role="alert">
          {error}
        </p>
      ))}

      {display === "board" ? (
        <TicketBoard tickets={tickets} members={members.data ?? []} update={update} onOpen={(id) => set("comment", id)} />
      ) : display === "calendar" ? (
        <TicketCalendar tickets={tickets} update={update} onOpen={(id) => set("comment", id)} />
      ) : (
        groups.map(([label, rows]) => (
          <section key={label}>
            {label && (
              <h2 className="bl-group-title">
                {label} <span>{rows.length}</span>
              </h2>
            )}
            {display === "table" ? (
              <TicketTable
                tickets={rows}
                members={members.data ?? []}
                update={update}
                sort={sort}
                onSort={(v) => set("sort", v)}
                onOpen={(id) => set("comment", id)}
                onFilterProject={(id) => set("project_id", id)}
                onFilterTag={(tag) => set("tag", tag)}
                onDelete={setDeleting}
              />
            ) : (
              <div className="bl-table-wrap">
                {rows.map((t) => (
                  <TicketRow key={t.id} ticket={t} members={members.data ?? []} update={update} onOpen={(id) => set("comment", id)} onFilterTag={(tag) => set("tag", tag)} onDelete={setDeleting} />
                ))}
              </div>
            )}
          </section>
        ))
      )}

      {query.data?.total === 0 && (
        <div className="bl-empty">
          <h2>Nothing here</h2>
          <p>No tickets match these filters. Clear them, or raise a new team ticket that isn't tied to a comment yet.</p>
          <div className="bl-chip-row" style={{ justifyContent: "center", marginTop: 12 }}>
            <button
              className="bl-quiet"
              onClick={() => {
                const next = new URLSearchParams();
                next.set("view", params.get("view") || "all");
                next.set("display", params.get("display") || "list");
                setParams(next);
              }}
            >
              Show all tickets
            </button>
            <button className="bl-button" onClick={() => setShowCreate(true)}>
              New ticket
            </button>
          </div>
        </div>
      )}

      {query.data && query.data.total > 0 && (
        <div className="bl-pagination">
          <button disabled={offset === 0} onClick={() => set("offset", String(Math.max(0, offset - 50)))}>
            Previous
          </button>
          <span>
            Showing {offset + 1}–{Math.min(offset + 50, query.data.total)} of {query.data.total}
          </span>
          <button disabled={offset + 50 >= query.data.total} onClick={() => set("offset", String(offset + 50))}>
            Next
          </button>
        </div>
      )}

      {showCreate && <NewTicket workspace={workspace} members={members.data ?? []} onClose={() => setShowCreate(false)} />}
      {deleting && <DeleteTicketDialog ticket={deleting} workspaceId={workspace.id} onCancel={() => setDeleting(null)} onDeleted={() => setDeleting(null)} />}
      {selected && <TicketDetail id={selected} workspace={workspace} members={members.data ?? []} onClose={() => set("comment", "")} />}
    </main>
  );
}
