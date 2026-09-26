import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useToast } from "../../components/Toast";
import { apiFetch, ApiError } from "../../lib/api-client";

import { useWSEvent } from "../../app/WSProvider";
import { BellIcon } from "../../components/icons";
import { useOnClickOutside } from "../../lib/use-click-outside";
import { qk } from "../../lib/query-keys";
import { useAuth } from "../auth/AuthContext";
import { timeAgo } from "../../lib/time";
import * as notificationsApi from "./api";
import type { NotificationOut } from "./api";


// design/index.html renderNotifs(): who did it (bold) + what happened, with their
// initials in a soft square. System events (deploys, integrations) come from Backline.
const ACTOR_COLORS = ["#F3D9C6", "#C9E4F5", "#D8E9D2", "#DCD4EF", "#F1DCE0", "#E3F8EF"];
function actorOf(notification: NotificationOut): { name: string; initials: string; color: string } {
  const payload = notification.payload as Record<string, unknown>;
  const name = typeof payload.actor_name === "string" && payload.actor_name.trim() ? payload.actor_name.trim() : "Backline";
  const initials = name === "Backline" ? "BL" : name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { name, initials, color: name === "Backline" ? "#E3F8EF" : ACTOR_COLORS[h % ACTOR_COLORS.length] };
}

// Map notification types to human-readable descriptions (FD-AUD-006)
function describe(notification: NotificationOut): string {
  const payload = notification.payload as Record<string, string>;
  const type = notification.type as string;
  switch (type) {
    case "comment_assigned":
      return "You were assigned a comment";
    case "comment_reply":
      return `${payload.actor_name || "Someone"} replied to a comment`;
    case "comment_mention":
      return `${payload.actor_name || "Someone"} mentioned you in a comment`;
    case "comment_status_changed":
      return `A comment was marked ${payload.new_status || "updated"}`;
    case "share_link_created":
      return "A new share link was created for a project";
    case "integration_disconnected":
      return `Your ${payload.integration_type ?? ""} integration was disconnected after repeated delivery failures`;
    case "deploy_recovery_completed":
      return "Comment anchors were re-mapped after a deploy";
    default:
      return "New notification";
  }
}

export function NotificationBell() {
  const { user, workspaceId } = useAuth();
  const { workspaceSlug } = useParams();
  const { toast } = useToast();
  const UNREAD_COUNT_KEY = [...qk.notificationsUnread(), workspaceId, user?.id];
  const LIST_KEY = [...qk.notificationsList(), workspaceId, user?.id];
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(containerRef, () => setOpen(false));

  const { data: unread } = useQuery({
    queryKey: UNREAD_COUNT_KEY,
    queryFn: notificationsApi.unreadCount,
    staleTime: 30_000,
  });

  const { data: notifications, isLoading, isError, refetch } = useQuery({
    queryKey: LIST_KEY,
    queryFn: () => notificationsApi.listNotifications(),
    enabled: open,
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: qk.notificationsUnread() });
    queryClient.invalidateQueries({ queryKey: qk.notificationsList() });
  }, [queryClient]);

  useWSEvent(
    "notification.new",
    useCallback(
      (payload: { recipient_user_id: string }) => {
        if (payload.recipient_user_id === user?.id) invalidate();
      },
      [user?.id, invalidate],
    ),
  );

  async function handleMarkAllRead() {
    try {
    await notificationsApi.markAllRead();
    invalidate();
    } catch { toast("Could not mark notifications as read.", "error"); }
  }

  async function handleClickNotification(notification: NotificationOut) {
    // Mark as read then navigate to target_route if provided
    try { if (!notification.read_at) {
      await notificationsApi.markRead(notification.id);
      invalidate();
    } } catch { toast("Could not mark this notification as read.", "error"); }
    const base = workspaceSlug ? `/w/${workspaceSlug}` : "/";
    const payload = notification.payload as Record<string, unknown>;
    const project = typeof payload.project_id === "string" ? payload.project_id : null;
    const comment = typeof payload.comment_id === "string" ? payload.comment_id : null;
    const fallback = project && workspaceSlug ? `${base}/p/${encodeURIComponent(project)}/board${comment ? `?comment=${encodeURIComponent(comment)}` : ""}` : base;
    const route = notification.target_route;
      setOpen(false);
      if (project) {
        try {
          await apiFetch(`/api/v1/projects/${encodeURIComponent(project)}`);
          if (comment) await apiFetch(`/api/v1/comments/${encodeURIComponent(comment)}`);
        } catch (error) {
          toast(error instanceof ApiError && [403, 404].includes(error.status) ? "This notification target is no longer available." : "Could not open the notification target. Try again.", "error");
          navigate(base);
          return;
        }
      }
      navigate(route?.startsWith(`${base}/`) ? route : fallback);
  }

  function handleToggle() {
    setOpen((v) => !v);
  }

  return (
    <div className="bl-dropdown" ref={containerRef} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
      <button
        type="button"
        onClick={handleToggle}
        className="bl-icon-btn"
        aria-label={`Notifications${unread && unread > 0 ? `, ${unread} unread` : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <BellIcon />
        {!!unread && unread > 0 && <span className="bl-bell-dot" aria-hidden="true" />}
      </button>

      {open && (
        <div className="bl-dropdown-pop bl-notif-panel" role="menu" aria-label="Notifications">
          <div className="bl-notif-head">
            <span>NOTIFICATIONS</span>
            <button type="button" onClick={handleMarkAllRead}>Mark all read</button>
          </div>
          <ul role="list">
            {isLoading && <li role="status">Loading notifications…</li>}
            {isError && <li role="alert">Could not load notifications. <button onClick={() => void refetch()}>Retry</button></li>}
            {!isLoading && !isError && (notifications ?? []).length === 0 && (
              <li className="bl-notif-empty">No notifications yet.</li>
            )}
            {(notifications ?? []).map((notification) => {
              const route = (notification as NotificationOut & { target_route?: string }).target_route;
              return (
                <li
                  key={notification.id}
                  className={`bl-notif-item${!notification.read_at ? " unread" : ""}`}
                  onClick={() => handleClickNotification(notification)}
                  role="menuitem"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      void handleClickNotification(notification);
                    }
                  }}
                  aria-label={`${describe(notification)}${route ? " — click to view" : ""}`}
                >
                  {(() => {
                    const actor = actorOf(notification);
                    return <span className="bl-nt-av" style={{ background: actor.color }} aria-hidden="true">{actor.initials}</span>;
                  })()}
                  <span className="bl-nt-b">
                    <span className="bl-nt-t">{(() => {
                      const text = describe(notification);
                      const name = actorOf(notification).name;
                      return text.startsWith(name) ? <><b>{name}</b>{text.slice(name.length)}</> : text;
                    })()}</span>
                    <span className="bl-nt-d">{timeAgo(notification.created_at)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
