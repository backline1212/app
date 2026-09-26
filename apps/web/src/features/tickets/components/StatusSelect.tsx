import { STATUS_LABELS, WORKFLOW_STATUSES } from "../../../lib/workflow";
import { PRIORITY_META } from "../../projects/panel/comments/types";
import * as api from "../api";

type Priority = "high" | "medium" | "low";

// The design's status .pill and priority chip (design/index.html taskRow/tTable),
// kept as native selects laid over the pill so the list and table stay editable inline.
export function StatusSelect({ ticket, disabled, onChange }: { ticket: api.Ticket; disabled: boolean; onChange: (status: api.Ticket["status"]) => void }) {
  return (
    <span className={`bl-pill-select bl-st-${ticket.status}`} onClick={(e) => e.stopPropagation()}>
      <i aria-hidden="true" />
      <select aria-label={`Status for ${ticket.body.slice(0, 40)}`} value={ticket.status} disabled={disabled} onChange={(e) => onChange(e.target.value as api.Ticket["status"])}>
        {WORKFLOW_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
    </span>
  );
}

export function PrioritySelect({ ticket, disabled, onChange }: { ticket: api.Ticket; disabled: boolean; onChange: (priority: Priority) => void }) {
  const value = (ticket.priority ?? "medium") as Priority;
  return (
    <span className="bl-pill-select bl-prio-pill" style={{ color: PRIORITY_META[value].color }} onClick={(e) => e.stopPropagation()}>
      <i aria-hidden="true" />
      <select aria-label={`Priority for ${ticket.body.slice(0, 40)}`} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as Priority)}>
        {(["high", "medium", "low"] as const).map((p) => (
          <option key={p} value={p}>
            {PRIORITY_META[p].label}
          </option>
        ))}
      </select>
    </span>
  );
}
