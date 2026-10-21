import type { Schemas } from "@backline/types";
import { apiFetch } from "../../lib/api-client";

export type Ticket = Schemas["TicketOut"];
export type TicketCreate = Schemas["TicketCreate"];
export function listTickets(workspaceId: string, params = new URLSearchParams()) {
  return apiFetch<Schemas["TicketListOut"]>(`/api/v1/workspaces/${workspaceId}/tickets?${params}`);
}
export function getDashboard(workspaceId: string) {
  return apiFetch<Schemas["DashboardOut"]>(`/api/v1/workspaces/${workspaceId}/dashboard`);
}
export function createTicket(projectId: string, body: TicketCreate, signal?: AbortSignal) {
  return apiFetch<Ticket>(`/api/v1/projects/${projectId}/tickets`, { method: "POST", body: JSON.stringify(body), signal });
}
