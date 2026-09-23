import { Avatar } from "@backline/ui";
import { useState, type CSSProperties } from "react";
import { STATUS_COLORS, STATUS_LABELS, WORKFLOW_STATUSES, isClosed } from "../../../lib/workflow";
import { PRIORITY_META, dueMeta } from "../../projects/panel/comments/types";
import { ticketRef } from "../../../lib/ticket-ref";
import type { MemberOut } from "../../workspaces/api";
import * as api from "../api";
import type { TicketUpdateMutation } from "./types";

/**
 * The design's ticket board (design/index.html's tBoard/taskCard): one column per
 * status, tinted by that status, each holding compact cards - ticket number and
 * priority on top, the ticket, where it came from, then its first tag, due date and
 * assignee faces. Status is changed by dragging a card between columns.
 */
export function TicketBoard({
  tickets,
  members,
  update,
  onOpen,
}: {
  tickets: api.Ticket[];
  members: MemberOut[];
  update: TicketUpdateMutation;
  onOpen: (id: string) => void;
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);

  function memberLabel(userId: string): string {
    const member = members.find((m) => m.user_id === userId);
    return member?.name || member?.email || "Former member";
  }

  return (
    <div className="bl-tboard">
      {WORKFLOW_STATUSES.map((s) => {
        const column = tickets.filter((t) => t.status === s);
        return (
          <section
            key={s}
            className="bl-bcol"
            style={{ "--c": STATUS_COLORS[s] } as CSSProperties}
            aria-label={`${STATUS_LABELS[s]} (${column.length})`}
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.setAttribute('data-dragover', 'true');
            }}
            onDragLeave={(e) => {
              e.currentTarget.removeAttribute('data-dragover');
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.removeAttribute('data-dragover');
              const id = e.dataTransfer.getData("text/plain");
              // Guard against a second drop firing while the first status-change mutation
              // is still in flight - without this, two quick mutate() calls can reset()
              // away the first call's error state right as the second succeeds, flashing
              // the error banner in TicketsPage for one frame.
              if (id && !update.isPending) {
                const ticket = tickets.find(t => t.id === id);
                if (ticket && ticket.status !== s) {
                  update.mutate({ id, patch: { status: s } });
                }
              }
              setDraggedId(null);
            }}
          >
            <h2 className="bl-bcol-h">
              <i className="bl-status-dot" style={{ background: STATUS_COLORS[s] }} aria-hidden="true" />
              {STATUS_LABELS[s]}
              <b>{column.length}</b>
            </h2>
            <div className="bl-bcol-b">
              {column.length === 0 && <p className="bl-bcol-e">Drop a ticket here</p>}
              {column.map((t) => {
                const priority = PRIORITY_META[t.priority ?? "medium"];
                const due = dueMeta(t.due_at, isClosed(t.status));
                const assigneeIds = t.assignee_ids?.length ? t.assignee_ids : [];
                return (
                  <button
                    type="button"
                    key={t.id}
                    draggable
                    className={`bl-tc${draggedId === t.id ? " bl-dragging" : ""}`}
                    onClick={() => onOpen(t.id)}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", t.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDraggedId(t.id);
                    }}
                    onDragEnd={() => setDraggedId(null)}
                  >
                    <span className="bl-tc-top">
                      <span className="bl-tid">{ticketRef(t)}</span>
                      <span className="bl-tc-prio" style={{ color: priority.color }}>● {priority.label}</span>
                    </span>
                    <span className="bl-tc-t">{t.body}</span>
                    <span className="bl-tc-s">{t.project_name} · {t.is_standalone ? "Team ticket" : (t.page_path ?? t.page_title)}</span>
                    <span className="bl-tc-foot">
                      {t.tags?.slice(0, 1).map((tag) => <span className="bl-chip" key={tag}>{tag}</span>)}
                      {due && (
                        <span className={`bl-due-chip ${due.tone === "late" ? "is-late" : due.tone === "soon" ? "is-soon" : ""}`}>{due.text}</span>
                      )}
                      {assigneeIds.length > 0 && (
                        <span className="bl-tc-faces" title={assigneeIds.map(memberLabel).join(", ")}>
                          {assigneeIds.slice(0, 3).map((id) => (
                            <Avatar key={id} name={memberLabel(id)} size={20} />
                          ))}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
