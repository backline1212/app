import { useQuery } from "@tanstack/react-query";

import { EmptyArt } from "../../components/illustrations";
import { qk } from "../../lib/query-keys";
import { useOnlineStatus } from "../../lib/use-online-status";
import { STATUS_COLORS, STATUS_LABELS, WORKFLOW_STATUSES } from "../../lib/workflow";
import * as reviewApi from "./api";

// FD-AUD-042/M-04 "show ticket board to client" - a read-only, client-safe list.
// Only reachable when the project's show_board_to_client setting is on; the
// endpoint independently re-checks that server-side regardless of how this
// screen was reached (comments/service.py::list_guest_board).
export function GuestBoard({
  projectId,
  guestToken,
  guestName,
  onBack,
  onLeave,
  continueLabel,
  onContinue,
}: {
  projectId: string;
  guestToken: string;
  guestName?: string;
  onBack: () => void;
  onLeave?: () => void;
  continueLabel?: string;
  onContinue?: () => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: qk.guestBoard(projectId, guestToken),
    queryFn: () => reviewApi.getGuestBoard(projectId, guestToken),
  });
  const online = useOnlineStatus();

  // Real workflow statuses (todo/in_progress/in_review/blocked/resolved/wont_fix),
  // not the reference HTML's abbreviated column ids - grouping by anything else
  // silently hides every card since GuestBoardItemOut.status only ever uses these.
  const grouped = data?.items.reduce((acc, item) => {
    const s = item.status || "todo";
    if (!acc[s]) acc[s] = [];
    acc[s].push(item);
    return acc;
  }, {} as Record<string, typeof data.items>) ?? {};

  return (
    <div className="bl-review" style={{ background: "var(--bl-paper)", minHeight: "100vh" }}>
      <header className="bl-review-head">
        <h1>Board</h1>
        {onContinue && (
          <button className="bl-button" onClick={onContinue} style={{ marginLeft: "auto" }}>
            {continueLabel ?? "Continue to site"}
          </button>
        )}
        <button onClick={onBack} className="bl-quiet">
          Back
        </button>
      </header>

      {guestName && (
        <div className="bl-guest-bar">
          <span>
            Viewing as <b>{guestName}</b> · Guest review
          </span>
          {onLeave && (
            <button type="button" className="bl-guest-bar-out" onClick={onLeave}>
              Leave review
            </button>
          )}
        </div>
      )}

      {!online && (
        <div className="bl-conn-banner offline" role="status" aria-live="polite">
          You are offline. The board will refresh once you reconnect.
        </div>
      )}

      <div className="bl-review-body" style={{ display: "block", padding: "20px" }}>
        {isLoading && <p className="bl-mono">Loading board...</p>}
        {error && <p className="bl-error">Could not load the board.</p>}

        {data && data.items.length === 0 && (
          <div className="bl-empty">
            <EmptyArt kind="board" />
            <h2>No items yet</h2>
            <p>The board is currently empty.</p>
          </div>
        )}

        {data && data.items.length > 0 && (
          <div className="bl-board">
            {WORKFLOW_STATUSES.map((statusKey) => {
              const items = grouped[statusKey] || [];
              if (items.length === 0) return null; // hide empty columns for guests
              return (
                <section key={statusKey}>
                  <h2>
                    {STATUS_LABELS[statusKey]}
                    <span>{items.length}</span>
                  </h2>
                  {items.map((item) => (
                    <article key={item.id}>
                      <small>#{item.id}</small>
                      <p className="bl-ticket-title">{item.body}</p>

                      <div style={{ marginTop: "12px", display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
                        <div
                          className="bl-status-select"
                          style={{ borderLeftColor: STATUS_COLORS[statusKey], cursor: "default", opacity: 0.8, pointerEvents: "none" }}
                        >
                          {STATUS_LABELS[statusKey]}
                        </div>
                        {item.due_at && (
                          <div className="bl-date" style={{ cursor: "default", opacity: 0.8, pointerEvents: "none" }}>
                            {new Date(item.due_at).toLocaleDateString()}
                          </div>
                        )}
                        {item.assignee_names && item.assignee_names.length > 0 && (
                          <div className="bl-chip" style={{ opacity: 0.8 }}>
                            {item.assignee_names.join(", ")}
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
