import type { Schemas } from "@backline/types";
import { Avatar, LayerBadge, RecoveryBadge } from "@backline/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { patchProjectComment, upsertProjectComment } from "../../../../lib/comment-cache";
import { renderWithMentions } from "../../../../lib/mentions";
import { ticketRef } from "../../../../lib/ticket-ref";
import { timeAgo } from "../../../../lib/time";
import { useOnClickOutside } from "../../../../lib/use-click-outside";
import { useFloatingPosition } from "../../../../lib/use-floating-position";
import { isClosed } from "../../../../lib/workflow";
import { aiErrorMessage, suggestReply } from "../../../ai/api";
import * as boardApi from "../../../board/api";
import type { CommentLayer, CommentOut, CommentStatus } from "../../../board/api";
import { MentionsInput } from "../../../comments/MentionsInput";
import type { PageOut } from "../../../pages/api";
import { DatePicker } from "../../../tickets/components/DatePicker";
import type { MemberOut } from "../../../workspaces/api";
import {
  COMMENT_TAGS,
  PRIORITY_META,
  PRIORITY_ORDER,
  STATUS_META,
  STATUS_ORDER,
  dueMeta,
  type CommentPriority,
} from "./types";

type CommentTag = NonNullable<CommentOut["tags"]>[number];
type MenuId = "status" | "waiting" | "tags" | "assignees";

interface CommentContext {
  browser?: string;
  os?: string;
  device_type?: string;
  viewport?: { width?: number; height?: number };
}

interface CommentAnchor {
  type?: string;
  dom_fingerprint?: { selector_path?: string };
}

export interface CommentDetailProps {
  comment: CommentOut;
  replies: CommentOut[];
  projectId: string;
  workspaceId: string;
  members: MemberOut[];
  pages: PageOut[];
  onBack: () => void;
  onShowOnPage: (commentId: string) => void;
}

const icon = (paths: ReactNode, size = 12, strokeWidth = 2) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {paths}
  </svg>
);
const ChevronIcon = () => icon(<path d="M6 9l6 6 6-6" />, 10, 2.4);
const TickIcon = () => icon(<path d="M20 6L9 17l-5-5" />, 13, 2.5);
const SparkleIcon = () => icon(<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />);
const CodeIcon = () => icon(<path d="M16 18l6-6-6-6M8 6l-6 6 6 6" />);
const PlusIcon = () => icon(<path d="M12 5v14M5 12h14" />, 11, 2.4);
const CalendarIcon = () =>
  icon(
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>,
    12,
    1.8,
  );
const ImageIcon = () =>
  icon(
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="M21 16l-5-5-9 9" />
    </>,
    14,
    1.8,
  );
const BackIcon = () => icon(<path d="M19 12H5M11 18l-6-6 6-6" />);

function memberLabel(members: MemberOut[], userId: string): string {
  const member = members.find((m) => m.user_id === userId);
  return member?.name || member?.email || "Former member";
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

// Stored due dates are midnight UTC (DatePicker), so read back in UTC too - a local
// read would show the day before for anyone west of Greenwich.
function formatDue(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function pagePath(pages: PageOut[], pageId: string): string {
  const page = pages.find((p) => p.id === pageId);
  if (!page) return "Unknown page";
  try {
    return new URL(page.url_normalized).pathname || "/";
  } catch {
    return page.url_normalized;
  }
}

// The widget's selector paths are exact but long (every ancestor, with
// :nth-of-type() positions) - fine for re-finding the element, noisy to read. This is
// the readable tail of it; the full path stays in the element's title.
function shortSelector(path: string): string {
  const parts = path
    .split(">")
    .map((part) => part.trim().replace(/:nth-(of-type|child)\(\d+\)/g, ""))
    .filter(Boolean);
  return parts.slice(-3).join(" > ");
}

function techLine(comment: CommentOut): string {
  const context = comment.context as CommentContext;
  const viewport =
    context.viewport?.width && context.viewport?.height
      ? `${context.viewport.width}×${context.viewport.height}`
      : null;
  return [context.browser, context.os, viewport].filter(Boolean).join(" · ");
}

// "Turn into a dev task": a hand-off a developer can paste into their tracker, built
// only from what the comment actually recorded - no model involved, so nothing in it
// is invented.
function devTaskText(comment: CommentOut, replies: CommentOut[], page: string): string {
  const anchor = comment.anchor as CommentAnchor;
  const context = comment.context as CommentContext;
  const headline = comment.body.split("\n")[0].trim();
  const lines = [
    `Fix: ${headline.length > 90 ? `${headline.slice(0, 87)}...` : headline}`,
    "",
    `Page: ${page}`,
  ];
  if (anchor.dom_fingerprint?.selector_path) lines.push(`Element: ${anchor.dom_fingerprint.selector_path}`);
  const tech = [techLine(comment), context.device_type].filter(Boolean).join(" · ");
  if (tech) lines.push(`Seen on: ${tech}`);
  if (comment.tags?.length) lines.push(`Tags: ${comment.tags.join(", ")}`);
  lines.push(`Priority: ${PRIORITY_META[comment.priority ?? "medium"].label}`);
  lines.push(`Reported by ${comment.author_name}, ${new Date(comment.created_at).toLocaleDateString()}`);
  lines.push("", "What they said:", comment.body.trim());
  if (replies.length > 0) {
    lines.push("", "Discussion:");
    for (const reply of replies) lines.push(`- ${reply.author_name}: ${reply.body.trim()}`);
  }
  return lines.join("\n");
}

/**
 * A menu anchored to one of the detail's pickers. Portaled to <body>, like the list
 * row's own "Move to" menu, so the drawer's scroll area can't clip it.
 */
function DetailMenu({
  triggerRef,
  open,
  label,
  onClose,
  children,
}: {
  triggerRef: RefObject<HTMLButtonElement>;
  open: boolean;
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const position = useFloatingPosition(triggerRef, menuRef, open);
  useOnClickOutside<HTMLElement>([triggerRef, menuRef], () => {
    if (open) onClose();
  });

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Captured on window, ahead of ProjectSidePanel's document-level Escape (which
      // closes the whole drawer), and stopped here: Escape only closes this menu.
      event.stopPropagation();
      onClose();
      triggerRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose, triggerRef]);

  if (!open) return null;
  return createPortal(
    <div
      ref={menuRef}
      className="bl-comment-popover"
      role="menu"
      aria-label={label}
      style={{
        position: "fixed",
        top: position?.top ?? -9999,
        left: position?.left ?? -9999,
        visibility: position ? "visible" : "hidden",
      }}
    >
      <div className="bl-review-popover-label">{label}</div>
      {children}
    </div>,
    document.body,
  );
}

function MenuOption({
  checked,
  role,
  onSelect,
  children,
}: {
  checked: boolean;
  role: "menuitemradio" | "menuitemcheckbox";
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" role={role} aria-checked={checked} className="bl-review-menu-row" onClick={onSelect}>
      <span className="bl-cd-opt">{children}</span>
      <span className="bl-cd-tick" aria-hidden="true">
        {checked && <TickIcon />}
      </span>
    </button>
  );
}

function Message({ comment, showContext }: { comment: CommentOut; showContext: boolean }) {
  const anchor = comment.anchor as CommentAnchor;
  const selector = anchor.dom_fingerprint?.selector_path;
  const tech = techLine(comment);
  return (
    <div className="bl-cd-msg">
      <Avatar name={comment.author_name} size={28} />
      <div className="bl-cd-msg-body">
        <div className="bl-cd-msg-meta">
          <span className="bl-cd-who">{comment.author_name}</span>
          <span className="bl-cd-time">
            {comment.author_type === "guest" ? "Guest" : "Member"} · {timeAgo(comment.created_at)}
          </span>
          {comment.layer === "team" && <span className="bl-cd-tag">Team only</span>}
        </div>
        <p>{renderWithMentions(comment.body)}</p>
        {(comment.screenshot_url || comment.attachments.length > 0) && (
          <div className="bl-cd-att">
            {comment.screenshot_url && (
              <a href={comment.screenshot_url} target="_blank" rel="noreferrer" className="bl-cd-shot">
                <img src={comment.screenshot_url} alt="Captured review context" />
              </a>
            )}
            {comment.attachments.map((attachment) =>
              attachment.content_type.startsWith("image/") ? (
                <a key={attachment.url} href={attachment.url} target="_blank" rel="noreferrer" className="bl-cd-shot">
                  <img src={attachment.url} alt={attachment.filename} />
                </a>
              ) : (
                <a
                  key={attachment.url}
                  href={attachment.url}
                  target="_blank"
                  rel="noreferrer"
                  className="bl-chip"
                  title={attachment.filename}
                >
                  {attachment.filename}
                </a>
              ),
            )}
          </div>
        )}
        {showContext && !comment.screenshot_url && comment.capture_status === "failed" && (
          <span className="bl-comment-shot-failed">Screenshot capture failed</span>
        )}
        {showContext && (tech || selector) && (
          <div className="bl-cd-tech">
            {tech && <div>{tech}</div>}
            {selector && <div title={selector}>{shortSelector(selector)}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One comment, opened from the review drawer's list: its workflow fields up top
 * (status, waiting on, tags, assignees, due date, priority, page), the whole thread
 * below, and a reply box pinned to the bottom - the design's comment detail
 * ("All comments" back to the list). Edits go through the same PATCH and cache merge
 * as the list rows, so the list, the board and the canvas widget all stay in step.
 */
export function CommentDetail({
  comment,
  replies,
  projectId,
  workspaceId,
  members,
  pages,
  onBack,
  onShowOnPage,
}: CommentDetailProps) {
  const queryClient = useQueryClient();
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);
  const [body, setBody] = useState("");
  const [layer, setLayer] = useState<CommentLayer>("client");
  const [attachments, setAttachments] = useState<Schemas["AttachmentIn"][]>([]);
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(false);
  const [devTask, setDevTask] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const backRef = useRef<HTMLButtonElement>(null);
  const statusRef = useRef<HTMLButtonElement>(null);
  const waitingRef = useRef<HTMLButtonElement>(null);
  const tagsRef = useRef<HTMLButtonElement>(null);
  const assigneesRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const closeMenu = useCallback(() => setOpenMenu(null), []);
  const toggleMenu = (menu: MenuId) => setOpenMenu((current) => (current === menu ? null : menu));

  const update = useMutation({
    mutationFn: (patch: Schemas["CommentUpdate"]) => boardApi.updateComment(comment.id, patch),
    onSuccess: (updated) => patchProjectComment(queryClient, projectId, updated.id, updated),
  });

  const reply = useMutation({
    mutationFn: () => boardApi.createReply(comment.id, body.trim(), layer, attachments, mentionedUserIds),
    onSuccess: (created) => {
      setBody("");
      setAttachments([]);
      setMentionedUserIds([]);
      // Upsert, not append: the comment.created broadcast for this same reply may
      // land first.
      upsertProjectComment(queryClient, projectId, created);
    },
  });

  const draft = useMutation({
    mutationFn: () => suggestReply(workspaceId, projectId, comment.id),
    onSuccess: (result) => {
      if (result.suggestions[0]) setBody(result.suggestions[0]);
    },
  });

  // A different comment (another row, or a pin clicked in the canvas) starts clean:
  // an unsent draft or dev-task card belongs to the comment it was written for.
  useEffect(() => {
    setOpenMenu(null);
    setBody("");
    setAttachments([]);
    setMentionedUserIds([]);
    setDevTask(null);
    // draft (suggestReply) isn't recreated by this comment change - useMutation keeps
    // its isError/error from whichever comment last called it, so without this an "AI
    // is busy" banner from a previous comment would still show under a fresh one that
    // was never even asked for a draft yet.
    draft.reset();
    // Only when the click that got here came from this drawer: opening a row removes
    // it, dropping focus to <body>, and the back button is where that focus belongs.
    // A pin clicked inside the canvas leaves focus on the iframe, and pulling it out
    // would take Escape (and the rest of the keyboard) away from the widget's own card.
    const active = document.activeElement;
    if (!active || active === document.body) backRef.current?.focus();
    // draft is intentionally left out below: it's a useMutation result recreated every
    // render, so depending on it would re-run this whole effect (including the focus
    // logic above) on every render instead of only on an actual comment change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comment.id]);

  function setStatus(status: CommentStatus) {
    update.mutate({
      status,
      // Nobody is waiting on a reply to a closed comment.
      ...(isClosed(status) ? { waiting_on_ids: [], waiting_on_client: false } : {}),
    });
  }

  function toggleIn<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  async function onFilesPicked(files: FileList | null) {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    setUploadError(false);
    try {
      const uploaded = await Promise.all(Array.from(files).map((file) => boardApi.uploadAttachment(projectId, file)));
      setAttachments((current) => [...current, ...uploaded]);
    } catch {
      setUploadError(true);
    } finally {
      setIsUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function submitReply() {
    if (!body.trim() || reply.isPending || isUploading) return;
    reply.mutate();
  }

  async function copyDevTask() {
    if (!devTask) return;
    try {
      await navigator.clipboard.writeText(devTask);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  const status = STATUS_META[comment.status];
  const closed = isClosed(comment.status);
  const due = dueMeta(comment.due_at, closed);
  const assigneeIds = comment.assignee_ids?.length
    ? comment.assignee_ids
    : comment.assignee_id
      ? [comment.assignee_id]
      : [];
  const waitingIds = comment.waiting_on_ids ?? [];
  const page = pagePath(pages, comment.page_id);
  const isRegion = (comment.anchor as CommentAnchor).type === "region";
  const priority: CommentPriority = comment.priority ?? "medium";

  return (
    <div className="bl-cd">
      <div className="bl-cd-head">
        <button ref={backRef} type="button" className="bl-cd-back" onClick={onBack}>
          <BackIcon />
          All comments
        </button>
        <span className="bl-cd-badges">
          <LayerBadge layer={comment.layer} />
          {comment.recovery_status !== "ok" && <RecoveryBadge status={comment.recovery_status} />}
        </span>
        <span className="bl-cd-id">{ticketRef(comment)}</span>
      </div>

      <div className="bl-cd-meta">
        <div className="bl-cd-row">
          <span className="bl-cd-label">STATUS</span>
          <button
            ref={statusRef}
            type="button"
            className="bl-cd-status"
            style={{ "--c": status.color } as CSSProperties}
            aria-haspopup="menu"
            aria-expanded={openMenu === "status"}
            aria-label={`Status: ${status.label}. Change status`}
            onClick={() => toggleMenu("status")}
          >
            <span className="bl-status-dot" />
            {status.label}
            <ChevronIcon />
          </button>
          <DetailMenu triggerRef={statusRef} open={openMenu === "status"} label="Set status" onClose={closeMenu}>
            {STATUS_ORDER.map((option) => (
              <MenuOption
                key={option}
                role="menuitemradio"
                checked={option === comment.status}
                onSelect={() => {
                  closeMenu();
                  statusRef.current?.focus();
                  if (option !== comment.status) setStatus(option);
                }}
              >
                <span className="bl-status-dot" style={{ background: STATUS_META[option].color }} />
                {STATUS_META[option].label}
              </MenuOption>
            ))}
          </DetailMenu>
        </div>

        {!closed && (
          <div className="bl-cd-row">
            <span className="bl-cd-label">WAITING ON</span>
            <button
              ref={waitingRef}
              type="button"
              className="bl-cd-pick"
              aria-haspopup="menu"
              aria-expanded={openMenu === "waiting"}
              onClick={() => toggleMenu("waiting")}
            >
              {waitingIds.length === 0 && !comment.waiting_on_client ? (
                <span className="bl-cd-muted">Nobody, nothing is blocked on a reply</span>
              ) : (
                <span className="bl-cd-balls">
                  {comment.waiting_on_client && (
                    <span className="bl-cd-ball is-client">
                      <i />
                      client
                    </span>
                  )}
                  {waitingIds.map((id) => (
                    <span key={id} className="bl-cd-ball">
                      <i />
                      {firstName(memberLabel(members, id))}
                    </span>
                  ))}
                </span>
              )}
              <ChevronIcon />
            </button>
            <DetailMenu
              triggerRef={waitingRef}
              open={openMenu === "waiting"}
              label="Waiting for a reply from"
              onClose={closeMenu}
            >
              <MenuOption
                role="menuitemcheckbox"
                checked={comment.waiting_on_client}
                onSelect={() => update.mutate({ waiting_on_client: !comment.waiting_on_client })}
              >
                The client
              </MenuOption>
              {members.map((member) => (
                <MenuOption
                  key={member.user_id}
                  role="menuitemcheckbox"
                  checked={waitingIds.includes(member.user_id)}
                  onSelect={() => update.mutate({ waiting_on_ids: toggleIn(waitingIds, member.user_id) })}
                >
                  <Avatar name={member.name || member.email} size={18} />
                  {member.name || member.email}
                </MenuOption>
              ))}
            </DetailMenu>
          </div>
        )}

        <div className="bl-cd-row">
          <span className="bl-cd-label">TAGS</span>
          <span className="bl-cd-tags">
            {(comment.tags ?? []).map((tag) => (
              <button
                key={tag}
                type="button"
                className="bl-cd-tag is-act"
                onClick={() => toggleMenu("tags")}
                aria-label={`${tag} - change tags`}
              >
                {tag}
              </button>
            ))}
            <button
              ref={tagsRef}
              type="button"
              className="bl-cd-tag-add"
              aria-label="Add a tag"
              title="Add a tag"
              aria-haspopup="menu"
              aria-expanded={openMenu === "tags"}
              onClick={() => toggleMenu("tags")}
            >
              <PlusIcon />
            </button>
          </span>
          <DetailMenu triggerRef={tagsRef} open={openMenu === "tags"} label="Tag this as" onClose={closeMenu}>
            {COMMENT_TAGS.map((tag) => {
              const tags = (comment.tags ?? []) as CommentTag[];
              return (
                <MenuOption
                  key={tag}
                  role="menuitemcheckbox"
                  checked={tags.includes(tag)}
                  onSelect={() => update.mutate({ tags: toggleIn(tags, tag) })}
                >
                  {tag}
                </MenuOption>
              );
            })}
          </DetailMenu>
        </div>

        <div className="bl-cd-row">
          <span className="bl-cd-label">ASSIGNEE</span>
          <button
            ref={assigneesRef}
            type="button"
            className="bl-cd-pick"
            aria-haspopup="menu"
            aria-expanded={openMenu === "assignees"}
            onClick={() => toggleMenu("assignees")}
          >
            {assigneeIds.length === 0 ? (
              <span className="bl-cd-muted">Unassigned</span>
            ) : assigneeIds.length === 1 ? (
              <>
                <Avatar name={memberLabel(members, assigneeIds[0])} size={20} />
                <span>{memberLabel(members, assigneeIds[0])}</span>
              </>
            ) : (
              <>
                <span className="bl-cd-stack" title={assigneeIds.map((id) => memberLabel(members, id)).join(", ")}>
                  {assigneeIds.slice(0, 3).map((id) => (
                    <Avatar key={id} name={memberLabel(members, id)} size={20} />
                  ))}
                </span>
                <span>{assigneeIds.length} people</span>
              </>
            )}
            <ChevronIcon />
          </button>
          <DetailMenu triggerRef={assigneesRef} open={openMenu === "assignees"} label="Assign to" onClose={closeMenu}>
            {members.length === 0 && <div className="bl-cd-empty">No workspace members yet.</div>}
            {members.map((member) => (
              <MenuOption
                key={member.user_id}
                role="menuitemcheckbox"
                checked={assigneeIds.includes(member.user_id)}
                onSelect={() => update.mutate({ assignee_ids: toggleIn(assigneeIds, member.user_id) })}
              >
                <Avatar name={member.name || member.email} size={18} />
                {member.name || member.email}
              </MenuOption>
            ))}
          </DetailMenu>
        </div>

        <div className="bl-cd-row">
          <span className="bl-cd-label">DUE</span>
          <DatePicker
            value={comment.due_at}
            onChange={(due_at) => update.mutate({ due_at })}
            triggerClassName={`bl-cd-date ${comment.due_at ? "" : "is-empty"}`}
          >
            <CalendarIcon />
            {comment.due_at ? formatDue(comment.due_at) : "Set a date"}
          </DatePicker>
          {due && <span className={`bl-cd-due ${due.tone ? `is-${due.tone}` : ""}`}>{due.text}</span>}
        </div>

        <div className="bl-cd-row">
          <span className="bl-cd-label">PRIORITY</span>
          <span className="bl-cd-prio" role="group" aria-label="Priority">
            {PRIORITY_ORDER.map((option) => (
              <button
                key={option}
                type="button"
                className="bl-cd-prio-b"
                style={{ "--pc": PRIORITY_META[option].color } as CSSProperties}
                aria-pressed={priority === option}
                onClick={() => option !== priority && update.mutate({ priority: option })}
              >
                ● {PRIORITY_META[option].label}
              </button>
            ))}
          </span>
        </div>

        <div className="bl-cd-row">
          <span className="bl-cd-label">PAGE</span>
          <button
            type="button"
            className="bl-cd-page"
            onClick={() => onShowOnPage(comment.id)}
            title="Show this comment on the page"
          >
            {page}
          </button>
          {isRegion && <span className="bl-cd-tag">region</span>}
        </div>

        {update.isError && (
          <p role="alert" className="bl-error">
            Could not save that change.
          </p>
        )}
      </div>

      <div className="bl-cd-msgs">
        <Message comment={comment} showContext />
        {replies.map((item) => (
          <Message key={item.id} comment={item} showContext={false} />
        ))}
        {devTask && (
          <div className="bl-cd-out" role="region" aria-label="Dev task">
            <div className="bl-cd-out-head">
              <CodeIcon />
              DEV TASK
              <button type="button" className="bl-cd-out-copy" onClick={copyDevTask}>
                {copied ? "Copied" : "Copy"}
              </button>
              <button type="button" className="bl-cd-out-x" onClick={() => setDevTask(null)} aria-label="Dismiss dev task">
                ×
              </button>
            </div>
            <pre>{devTask}</pre>
          </div>
        )}
      </div>

      <form
        className="bl-cd-reply"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          submitReply();
        }}
      >
        <div className="bl-cd-tools">
          <button
            type="button"
            className="bl-cd-tool"
            aria-busy={draft.isPending}
            disabled={draft.isPending || !workspaceId}
            onClick={() => draft.mutate()}
          >
            <SparkleIcon />
            {draft.isPending ? "Writing..." : "Write a reply for me"}
          </button>
          <button type="button" className="bl-cd-tool" onClick={() => setDevTask(devTaskText(comment, replies, page))}>
            <CodeIcon />
            Turn into a dev task
          </button>
        </div>
        {draft.isError && (
          <p role="alert" className="bl-error">
            {aiErrorMessage(draft.error, "Could not draft a reply right now.")}
          </p>
        )}
        <MentionsInput
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onMentionedIdsChange={setMentionedUserIds}
          placeholder={`Reply to ${firstName(comment.author_name)}…`}
          aria-label={`Reply to ${comment.author_name}`}
          rows={3}
          className="bl-cd-textarea"
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              submitReply();
            }
          }}
        />
        <div className="bl-cd-shots">
          {attachments.map((attachment) => (
            <span key={attachment.key} className="bl-chip">
              {attachment.filename}
              <button
                type="button"
                className="bl-cd-chip-x"
                onClick={() => setAttachments((current) => current.filter((a) => a.key !== attachment.key))}
                aria-label={`Remove ${attachment.filename}`}
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            className="bl-cd-shot-add"
            onClick={() => fileRef.current?.click()}
            disabled={isUploading}
          >
            <ImageIcon />
            {isUploading ? "Uploading…" : "Attach a screenshot"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => onFilesPicked(event.target.files)}
          />
        </div>
        {uploadError && (
          <p role="alert" className="bl-error">
            Could not upload that screenshot.
          </p>
        )}
        <div className="bl-cd-actions">
          <button type="submit" className="bl-button" disabled={reply.isPending || isUploading || !body.trim()}>
            {reply.isPending ? "Posting…" : "Post reply"}
          </button>
          <button
            type="button"
            className="bl-quiet bl-cd-resolve"
            disabled={update.isPending}
            onClick={() => setStatus(comment.status === "resolved" ? "todo" : "resolved")}
          >
            {comment.status === "resolved" ? "Reopen" : "Resolve"}
          </button>
          <select
            value={layer}
            onChange={(event) => setLayer(event.target.value as CommentLayer)}
            aria-label="Reply visibility"
            className="bl-select bl-cd-layer"
          >
            <option value="client">Client visible</option>
            <option value="team">Team only</option>
          </select>
        </div>
        {reply.isError && (
          <p role="alert" className="bl-error">
            Could not post your reply.
          </p>
        )}
      </form>
    </div>
  );
}
