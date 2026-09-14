import { Avatar } from "@backline/ui";
import { useState } from "react";
import { STATUS_COLORS, STATUS_LABELS, WORKFLOW_STATUSES, isClosed } from "../../../lib/workflow";
import { PRIORITY_META, dueMeta } from "../../projects/panel/comments/types";
import type { MemberOut } from "../../workspaces/api";
import * as api from "../api";
import { StatusSelect } from "./StatusSelect";
import type { TicketUpdateMutation } from "./types";

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

  return (
    <div className="bl-board">
      {WORKFLOW_STATUSES.map((s) => (
        <section
          key={s}
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
            // is still in flight - StatusSelect already disables itself the same way
            // (line ~92); without this, two quick mutate() calls can reset() away the
            // first call's error state right as the second succeeds, flashing the error
            // banner in TicketsPage for one frame.
            if (id && id !== draggedId && !update.isPending) {
              const ticket = tickets.find(t => t.id === id);
              if (ticket && ticket.status !== s) {
                update.mutate({ id, patch: { status: s } });
              }
            }
            setDraggedId(null);
          }}
        >
          <h2>
            <i className="bl-dot" style={{ background: STATUS_COLORS[s] }} />
            {STATUS_LABELS[s]} <span>{tickets.filter((t) => t.status === s).length}</span>
          </h2>
          {tickets
            .filter((t) => t.status === s)
            .map((t) => {
              const priority = PRIORITY_META[t.priority ?? "medium"];
              const due = dueMeta(t.due_at, isClosed(t.status));
              const assigneeIds = t.assignee_ids?.length ? t.assignee_ids : [];
              return (
                <article
                  key={t.id}
                  draggable
                  style={{ borderLeft: `3px solid ${priority.color}` }}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", t.id);
                    e.dataTransfer.effectAllowed = "move";
                    setDraggedId(t.id);
                    // small timeout to allow drag image to render before styling source
                    setTimeout(() => e.target && (e.target as HTMLElement).classList.add("bl-dragging"), 0);
                  }}
                  onDragEnd={(e) => {
                    setDraggedId(null);
                    e.currentTarget.classList.remove("bl-dragging");
                  }}
                >
                  <small>{t.project_name}</small>
                  <button className="bl-ticket-title" onClick={() => onOpen(t.id)}>
                    {t.body}
                  </button>
                  <div className="bl-chip-row">
                    {t.tags?.map((tag) => (
                      <span className="bl-chip" key={tag}>
                        {tag}
                      </span>
                    ))}
                    {due && (
                      <span className={`bl-due-chip ${due.tone === "late" ? "is-late" : due.tone === "soon" ? "is-soon" : ""}`}>{due.text}</span>
                    )}
                  </div>
                  <div className="bl-chip-row" style={{ marginTop: 8, alignItems: "center", justifyContent: "space-between" }}>
                    <StatusSelect
                      ticket={t}
                      disabled={update.isPending}
                      onChange={(status) => update.mutate({ id: t.id, patch: { status } })}
                    />
                    {assigneeIds.length > 0 && (
                      <span style={{ display: "flex" }} title={assigneeIds.map((id) => members.find((m) => m.user_id === id)?.name ?? "Former member").join(", ")}>
                        {assigneeIds.slice(0, 3).map((id, index) => (
                          <span key={id} style={{ marginLeft: index === 0 ? 0 : -6, display: "flex" }}>
                            <Avatar name={members.find((m) => m.user_id === id)?.name ?? members.find((m) => m.user_id === id)?.email ?? "?"} size={20} />
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
        </section>
      ))}
    </div>
  );
}
