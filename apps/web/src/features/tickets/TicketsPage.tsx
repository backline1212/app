import { useEffect, useMemo, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { useDocumentTitle } from "../../lib/use-document-title";
import { useSelection } from "../../lib/use-selection";
import { STATUS_COLORS, STATUS_LABELS } from "../../lib/workflow";
import { SelectAllBox } from "../../components/BulkBar";
import { PlusIcon } from "../../components/icons";
import { EmptyArt } from "../../components/illustrations";
import { SearchField } from "../../components/SearchField";
import type { WorkspaceOut } from "../workspaces/api";
import { TicketBoard } from "./components/TicketBoard";
import { TicketBulkActions } from "./components/TicketBulkActions";
import { TicketCalendar } from "./components/TicketCalendar";
import { TicketRow } from "./components/TicketRow";
import { TicketTable } from "./components/TicketTable";
import { TicketToolbar } from "./components/TicketToolbar";
import { NewTicket } from "./components/NewTicket";
import { TicketDetail } from "./components/TicketDetail";
import { useTickets } from "./use-tickets";

const VIEW_LAYOUTS = [
  { id: "list", label: "List", icon: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /> },
  { id: "board", label: "Board", icon: <><rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="11" rx="1" /><rect x="17" y="4" width="4" height="7" rx="1" /></> },
  { id: "table", label: "Table", icon: <><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M3 10h18M3 15h18M10 4v16" /></> },
  { id: "calendar", label: "Calendar", icon: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></> },
];

const VIEW_TABS: { key: string; label: string; title?: string }[] = [
  { key: "all", label: "Everyone", title: "All tickets" },
  { key: "mine", label: "Assigned to me" },
  { key: "reply", label: "Needs your reply" },
  { key: "client", label: "Waiting on client" },
  { key: "overdue", label: "Overdue" },
];

export function TicketsPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceOut }>();
  useDocumentTitle([workspace.name, "Tickets"]);
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
    setMany,
    display,
    assignees,
    offset,
  } = useTickets(workspace.id, params, setParams);

  // Selection (TDR-0058) works in the List and Table layouts, over the rows on this
  // page. Anything that changes which rows are listed - a filter, the page, the layout -
  // starts it over; opening a ticket's detail doesn't.
  const selectable = display === "list" || display === "table";
  const visibleIds = useMemo(() => (selectable ? [...new Set(groups.flatMap(([, rows]) => rows.map((t) => t.id)))] : []), [groups, selectable]);
  const scopeKey = useMemo(() => {
    const scope = new URLSearchParams(params);
    scope.delete("comment");
    scope.delete("ticket");
    scope.sort();
    return scope.toString();
  }, [params]);
  const selection = useSelection(visibleIds, scopeKey);
  const search = params.get("search") ?? "";
  function setSearch(value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set("search", value);
    else next.delete("search");
    next.delete("offset");
    // Replaces the history entry, so Back leaves the page instead of un-typing a query.
    setParams(next, { replace: true });
  }

  const tabCounts: Record<string, number | undefined> = {
    all: dashboard.data?.tickets,
    mine: dashboard.data?.assigned_to_me,
    reply: dashboard.data?.needs_reply,
    client: dashboard.data?.waiting_on_client,
    overdue: dashboard.data?.overdue,
  };

  const activeFilters: { label: string; dot?: string; onClear: () => void }[] = [
    ...(search ? [{ label: `“${search}”`, onClear: () => setSearch("") }] : []),
    // An unknown status (a typo'd or outdated link) still gets a named, clearable chip
    // instead of a blank one with no React key.
    ...(params.get("status") ? [{ label: STATUS_LABELS[params.get("status") as keyof typeof STATUS_LABELS] ?? params.get("status")!, dot: STATUS_COLORS[params.get("status") as keyof typeof STATUS_COLORS], onClear: () => set("status", "") }] : []),
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

  const view = VIEW_TABS.some((tab) => tab.key === params.get("view")) ? params.get("view")! : "all";
  // Why the list is empty decides what to say and offer: filters to clear, a tab with
  // nothing in it (Overdue, Needs your reply…), or a workspace with no tickets at all.
  const narrowed = activeFilters.length > 0;
  const emptyTab: Record<string, string> = {
    mine: "Nothing is assigned to you right now.",
    reply: "Nobody is waiting on a reply from you.",
    client: "Nothing is waiting on a client.",
    overdue: "Nothing is overdue.",
  };
  // "ticket" is the name older links used for the same thing (search, asset review and
  // the dashboard sent it until TDR-0053); still honoured so saved links keep opening.
  const selected = params.get("comment") ?? params.get("ticket");
  function closeDetail() {
    const next = new URLSearchParams(params);
    next.delete("comment");
    next.delete("ticket");
    setParams(next);
  }

  // A page past the end - an old link, or the last ticket on the last page just closed
  // or deleted - moves back to the last page that has tickets instead of showing an
  // empty list captioned "Showing 201–30 of 30".
  const total = query.data?.total;
  const pageIsEmpty = query.data !== undefined && query.data.items.length === 0;
  useEffect(() => {
    if (query.isPlaceholderData || !pageIsEmpty || offset === 0 || total === undefined) return;
    const next = new URLSearchParams(params);
    const lastPage = total > 0 ? Math.floor((total - 1) / 50) * 50 : 0;
    if (lastPage > 0) next.set("offset", String(lastPage));
    else next.delete("offset");
    setParams(next, { replace: true });
  }, [query.isPlaceholderData, pageIsEmpty, offset, total, params, setParams]);
  const sort = params.get("sort") ?? "newest";
  const group = params.get("group") ?? "none";

  return (
    <main className="bl-wrap">
      <header className="bl-head">
        <div>
          <h1>{VIEW_TABS.find((tab) => tab.key === view)?.title ?? VIEW_TABS.find((tab) => tab.key === view)?.label}</h1>
          <p>Every review comment, plus the work your team raises directly.</p>
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

      {/* design/index.html .tfil-chip: what is narrowing the list, each one removable. */}
      {activeFilters.length > 0 && (
        <div className="bl-tfil-chips">
          {activeFilters.map((f) => (
            <span key={f.label} className="bl-tfil-chip">
              {f.dot && <i style={{ background: f.dot }} aria-hidden="true" />}
              {f.label}
              <button type="button" onClick={f.onClear} aria-label={`Stop filtering by ${f.label}`}>×</button>
            </span>
          ))}
        </div>
      )}

      <div className="bl-segment bl-ticket-filters" role="group" aria-label="Filter tickets">
        {VIEW_TABS.map((tab) => (
          <button key={tab.key} type="button" aria-pressed={view === tab.key} onClick={() => set("view", tab.key)}>
            {tab.label}
            {tabCounts[tab.key] !== undefined && <span className="bl-count">{tabCounts[tab.key]}</span>}
          </button>
        ))}
      </div>


      <div className="bl-toolbar bl-ticket-tools">
        {display === "list" && visibleIds.length > 0 && <SelectAllBox selection={selection} noun="tickets" />}
        <span className="bl-mono">{query.data?.total ?? "—"} TICKETS</span>
        <SearchField value={search} onChange={setSearch} label="Search tickets" placeholder="Search tickets…" />
        <div className="bl-tool-right">
          <TicketToolbar
            filters={{
              project_id: params.get("project_id") ?? "",
              status: params.get("status") ?? "",
              priority: params.get("priority") ?? "",
              tag: params.get("tag") ?? "",
            }}
            onFilter={(changes) => setMany(changes as Record<string, string>)}
            projects={(projects.data ?? []).filter((p) => !p.archived_at)}
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
                selection={selection}
              />
            ) : (
              <div className="bl-table-wrap">
                {rows.map((t) => (
                  <TicketRow
                    key={t.id}
                    ticket={t}
                    members={members.data ?? []}
                    update={update}
                    onOpen={(id) => set("comment", id)}
                    onFilterTag={(tag) => set("tag", tag)}
                    selected={selection.isSelected(t.id)}
                    onSelect={(range) => selection.toggle(t.id, range)}
                  />
                ))}
              </div>
            )}
          </section>
        ))
      )}

      {query.data?.total === 0 && (
        <div className="bl-empty">
          <EmptyArt kind={narrowed ? "search" : "tickets"} />
          <h2>{narrowed ? "Nothing here" : view !== "all" ? "All clear" : "No tickets yet"}</h2>
          <p>
            {narrowed
              ? "No tickets match these filters. Clear them, or raise a new team ticket that isn't tied to a comment yet."
              : view !== "all"
                ? emptyTab[view]
                : "Reviewers' comments land here as tickets. You can also raise one for your team directly."}
          </p>
          <div className="bl-chip-row" style={{ justifyContent: "center", marginTop: 12 }}>
            {(narrowed || view !== "all") && (
              <button
                className="bl-quiet"
                onClick={() => {
                  // Filters first; once none are left, the tab itself is what's narrowing.
                  const next = new URLSearchParams();
                  next.set("view", narrowed ? view : "all");
                  next.set("display", display);
                  setParams(next);
                }}
              >
                {narrowed ? "Clear filters" : "Show everyone's tickets"}
              </button>
            )}
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
      <TicketBulkActions selection={selection} tickets={tickets} members={members.data ?? []} workspaceId={workspace.id} />
      {selected && <TicketDetail id={selected} workspace={workspace} members={members.data ?? []} onClose={closeDetail} />}
    </main>
  );
}
