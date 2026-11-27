import type { Schemas } from "@backline/types";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { projectCan } from "../../lib/project-roles";
import { getAccessContextRevision } from "../../lib/auth-token";
import { invalidateTicketsAndDashboard, qk } from "../../lib/query-keys";
import { updateComment } from "../board/api";
import { listProjects } from "../projects/api";
import { listMembers } from "../workspaces/api";
import * as api from "./api";
import { STATUS_LABELS, TAGS, WORKFLOW_STATUSES, isClosed } from "../../lib/workflow";
import { ticketRef } from "../../lib/ticket-ref";
import { useToast } from "../../components/Toast";

// What the API accepts for each enumerated filter (dashboard/schemas.py TicketFilters).
// A value outside these - an old bookmark, a hand-edited link - used to fail the whole
// request with a 422 and leave the list empty; it is now just ignored.
const ALLOWED: Record<string, readonly string[]> = {
  view: ["all", "mine", "reply", "client", "overdue", "new"],
  sort: ["newest", "oldest", "due", "priority", "status", "project", "assignee", "tag"],
  status: WORKFLOW_STATUSES,
  priority: ["high", "medium", "low"],
  tag: TAGS,
};

export function useTickets(workspaceId: string, userId: string | undefined, params: URLSearchParams, setParams: (p: URLSearchParams) => void) {
  const cache = useQueryClient();
  const { toast } = useToast();
  const editing = useRef(false);
  const [updateWarning, setUpdateWarning] = useState("");

  const requestedDisplay = params.get("display") ?? "list";
  const display = ["list", "board", "table", "calendar"].includes(requestedDisplay) ? requestedDisplay : "list";
  const group = params.get("group") ?? "none";
  // The design lists by due date unless another order is picked.
  const requestedSort = params.get("sort") ?? "due";
  const sort = ALLOWED.sort.includes(requestedSort) ? requestedSort : "due";
  // "Assigned to me" is its own page: its other tabs (?mine=1) stay narrowed to the
  // signed-in person, and it offers no "Show work for" picker.
  const mine = params.get("view") === "mine" || params.get("mine") === "1";
  const assignees = mine ? [] : params.getAll("assignee");
  const offset = Math.max(0, Number(params.get("offset")) || 0);

  const request = new URLSearchParams();
  for (const key of ["search", "status", "project_id", "priority", "tag", "view"]) {
    const value = params.get(key);
    if (value && (!ALLOWED[key] || ALLOWED[key].includes(value))) request.set(key, value);
  }
  // "N open" on a project card: leave out resolved and won't-fix tickets.
  if (params.get("open") === "1" && !params.get("status")) request.set("open_only", "true");
  // "Show work for" can pick several people; the API matches any of them.
  for (const person of assignees) request.append("assignees", person);
  if (mine && userId && params.get("view") !== "mine") request.append("assignees", userId);
  request.set("sort", sort);
  request.set("offset", String(offset));
  request.set("limit", "50");

  const queryKeyStr = request.toString();
  const query = useQuery({ 
    queryKey: qk.ticketsList(workspaceId, queryKeyStr), 
    queryFn: () => api.listTickets(workspaceId, request),
    // Keep the current rows and counts on screen while a filter change loads, so
    // ticking people in "Show work for" doesn't blank the list and zero every count.
    placeholderData: keepPreviousData,
  });
  const projects = useQuery({ 
    queryKey: qk.projects(workspaceId), 
    queryFn: () => listProjects(workspaceId, true) 
  });
  const members = useQuery({ 
    queryKey: qk.members(workspaceId), 
    queryFn: () => listMembers(workspaceId) 
  });
  const dashboard = useQuery({ 
    queryKey: qk.dashboard(workspaceId), 
    queryFn: () => api.getDashboard(workspaceId) 
  });

  // How many tickets a tab would hold: the total of a one-row page.
  function countRequest(view: "reply" | "overdue", base: URLSearchParams) {
    const next = new URLSearchParams(base);
    next.set("view", view);
    next.set("offset", "0");
    next.set("limit", "1");
    return next;
  }
  function useCount(countParams: URLSearchParams, enabled: boolean) {
    const key = countParams.toString();
    return useQuery({
      queryKey: qk.ticketsList(workspaceId, key),
      queryFn: () => api.listTickets(workspaceId, countParams),
      select: (page) => page.total,
      enabled,
    }).data;
  }
  const myScope = new URLSearchParams(userId ? { assignees: userId } : {});
  const myReplyCount = useCount(countRequest("reply", myScope), mine && Boolean(userId));
  const myOverdueCount = useCount(countRequest("overdue", myScope), mine && Boolean(userId));
  // The header's overdue figure follows the filters in force, whichever tab is open.
  const filtered = new URLSearchParams(request);
  if (mine && userId) filtered.set("assignees", userId);
  const overdueCount = useCount(countRequest("overdue", filtered), !mine || Boolean(userId));

  const canEditTicket = (ticket: Pick<api.Ticket, "project_id">) => {
    const project = projects.data?.find(item => item.id === ticket.project_id);
    return Boolean(!projects.isError && project && !project.archived_at && projectCan(project, "edit"));
  };
  function requireEditable(id: string) {
    const ticket = query.data?.items.find(item => item.id === id);
    if (!ticket || !canEditTicket(ticket)) throw new Error("Editors and managers can change tickets in this project. Reload if your access recently changed.");
  }
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Schemas["CommentUpdate"] }) => {
      requireEditable(id);
      const current = query.data?.items.find(item => item.id === id);
      if (!current) throw new Error("This ticket is no longer in the list. Reload before editing.");
      return updateComment(id, patch, current.revision ?? 0);
    },
    onMutate: async ({ id, patch }) => {
      requireEditable(id);
      const key = qk.ticketsList(workspaceId, queryKeyStr);
      const contextRevision = getAccessContextRevision();
      await cache.cancelQueries({ queryKey: qk.tickets(workspaceId) });
      if (contextRevision !== getAccessContextRevision()) throw new Error("Your account or workspace changed. Check the current tickets before trying again.");
      const previous = cache.getQueryData<Schemas["TicketListOut"]>(key);
      const before = previous?.items.find((t) => t.id === id);
      cache.setQueryData<Schemas["TicketListOut"]>(key, (old) => {
        if (!old) return old;
        const items = old.items.map((t) => t.id === id ? { ...t, ...(patch as unknown as Partial<api.Ticket>) } : t);
        // Mirror the API's order straight away: finished tickets sit below open ones.
        return { ...old, items: [...items.filter((t) => !isClosed(t.status)), ...items.filter((t) => isClosed(t.status))] };
      });
      return { previous, key, contextRevision, before };
    },
    onSuccess: (saved, { id, patch }, context) => {
      // The saved revision, so an Undo straight away isn't refused as a stale edit.
      cache.setQueryData<Schemas["TicketListOut"]>(context.key, (old) => old && {
        ...old, items: old.items.map((t) => t.id === id ? { ...t, revision: saved.revision } : t),
      });
      const before = context.before;
      // Closing a ticket moves it to the bottom of the list - offer the way back.
      if (before && patch.status && isClosed(patch.status) && !isClosed(before.status)) {
        toast(`${ticketRef(before)} marked ${STATUS_LABELS[patch.status].toLowerCase()}.`, "success", {
          action: { label: "Undo", onClick: () => mutate({ id, patch: { status: before.status } }) },
        });
      }
    },
    onError: (_err, _newTodo, context) => {
      if (context?.previous && context.contextRevision === getAccessContextRevision()) {
        cache.setQueryData(context.key, context.previous);
      }
    },
    onSettled: (_saved, error, _variables, context) => {
      editing.current = false;
      if (context && context.contextRevision !== getAccessContextRevision()) return;
      if (error) setUpdateWarning(error.message);
      void invalidateTicketsAndDashboard(cache, workspaceId).catch(() => setUpdateWarning(error ? "The ticket list could not refresh. Reload to check the current state." : "Change saved. Reload to refresh the ticket list."));
    },
  });
  const mutate: typeof update.mutate = (variables, options) => {
    if (editing.current) return;
    editing.current = true; setUpdateWarning(""); update.mutate(variables, options);
  };

  function set(key: string, value: string | string[]) {
    const next = new URLSearchParams(params);
    if (Array.isArray(value)) {
      next.delete(key);
      value.forEach((v) => next.append(key, v));
    } else if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    if (key !== "offset" && key !== "comment") next.delete("offset");
    setParams(next);
  }

  const tickets = useMemo(() => query.data?.items ?? [], [query.data?.items]);
  const groups = useMemo(() => {
    const result = new Map<string, api.Ticket[]>();
    for (const ticket of tickets) {
      const keys =
        group === "status"
          ? [STATUS_LABELS[ticket.status]]
          : group === "project"
            ? [ticket.project_name]
            : group === "priority"
              ? [ticket.priority ?? "medium"]
              : group === "tag"
                ? ticket.tags?.length
                  ? ticket.tags
                  : ["No tags"]
                : group === "assignee"
                  ? ticket.assignee_ids?.length
                    ? ticket.assignee_ids.map((id) => members.data?.find((m) => m.user_id === id)?.name ?? "Former member")
                    : ["Unassigned"]
                  : [""];
      for (const key of keys) result.set(key, [...(result.get(key) ?? []), ticket]);
    }
    return [...result];
  }, [tickets, group, members.data]);

  return {
    query,
    projects,
    members,
    dashboard,
    update: { ...update, mutate, canEdit: canEditTicket },
    updateWarning,
    canCreate: !projects.isError && Boolean(projects.data?.some(project => !project.archived_at && projectCan(project, "edit"))),
    mine,
    myReplyCount,
    myOverdueCount,
    overdueCount,
    tickets,
    groups,
    set,
    display,
    group,
    sort,
    assignees,
    offset,
  };
}
