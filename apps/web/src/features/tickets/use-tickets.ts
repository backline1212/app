import type { Schemas } from "@backline/types";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { downloadCsv } from "../../lib/csv";
import { invalidateTicketsAndDashboard, qk } from "../../lib/query-keys";
import { updateComment } from "../board/api";
import { listProjects } from "../projects/api";
import { listMembers } from "../workspaces/api";
import * as api from "./api";
import { STATUS_LABELS, isClosed } from "../../lib/workflow";

export function useTickets(workspaceId: string, params: URLSearchParams, setParams: (p: URLSearchParams) => void) {
  const cache = useQueryClient();
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState(false);

  const display = params.get("display") ?? "list";
  const group = params.get("group") ?? "none";
  const sort = params.get("sort") ?? "newest";
  const assignees = params.getAll("assignee");
  const offset = Math.max(0, Number(params.get("offset")) || 0);

  const request = new URLSearchParams();
  for (const key of ["search", "status", "project_id", "priority", "tag", "view", "sort"]) {
    const value = params.get(key);
    if (value) request.set(key, value);
  }
  // "Show work for" can pick several people; the API matches any of them.
  for (const person of assignees) request.append("assignees", person);
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

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Schemas["CommentUpdate"] }) => updateComment(id, patch),
    onMutate: async ({ id, patch }) => {
      await cache.cancelQueries({ queryKey: qk.tickets(workspaceId) });
      const previous = cache.getQueryData<Schemas["TicketListOut"]>(qk.ticketsList(workspaceId, queryKeyStr));
      cache.setQueryData<Schemas["TicketListOut"]>(qk.ticketsList(workspaceId, queryKeyStr), (old) => {
        if (!old) return old;
        const items = old.items.map((t) => t.id === id ? { ...t, ...(patch as unknown as Partial<api.Ticket>) } : t);
        // Mirror the API's order straight away: finished tickets sit below open ones.
        return { ...old, items: [...items.filter((t) => !isClosed(t.status)), ...items.filter((t) => isClosed(t.status))] };
      });
      return { previous };
    },
    onError: (_err, _newTodo, context) => {
      if (context?.previous) {
        cache.setQueryData(qk.ticketsList(workspaceId, queryKeyStr), context.previous);
      }
    },
    onSettled: () => {
      invalidateTicketsAndDashboard(cache, workspaceId);
    },
  });

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

  async function exportAll() {
    setExporting(true);
    setExportError("");
    try {
      const rows: api.Ticket[] = [];
      for (let start = 0; ; start += 100) {
        const p = new URLSearchParams(request);
        p.set("offset", String(start));
        p.set("limit", "100");
        const page = await api.listTickets(workspaceId, p);
        rows.push(...page.items);
        if (start + page.items.length >= page.total || !page.items.length) break;
      }
      downloadCsv(
        [
          ["Project", "Ticket", "Status", "Priority", "Due", "Tags", "Assignees"],
          ...rows.map((t) => [
            t.project_name,
            t.body,
            STATUS_LABELS[t.status],
            t.priority,
            t.due_at?.slice(0, 10),
            t.tags?.join(", "),
            t.assignee_ids?.map((id) => members.data?.find((m) => m.user_id === id)?.name ?? id).join(", "),
          ]),
        ],
        "backline-tickets.csv",
      );
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Could not export tickets.");
    } finally {
      setExporting(false);
    }
  }

  return {
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
    group,
    sort,
    assignees,
    offset,
  };
}
