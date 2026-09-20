import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { qk } from "../../lib/query-keys";
import { useAutoGrow } from "../../lib/auto-grow";
import { useOnClickOutside } from "../../lib/use-click-outside";
import * as workspaceApi from "../workspaces/api";

interface MentionsInputProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  // M-06: notified server-side by stable member id, not by re-parsing "@Name" out of
  // the body text later (names aren't unique or stable - a later rename or a same-
  // named member would misfire). Called once per picker selection with the accumulated
  // set of member ids inserted into this draft; the caller resets it when the draft is
  // cleared/submitted (CommentThreadPanel.tsx).
  onMentionedIdsChange?: (memberIds: string[]) => void;
}

export function MentionsInput({ onMentionedIdsChange, ...props }: MentionsInputProps) {
  const { workspaceSlug } = useParams();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Replies run long - the box grows with the reply instead of leaving someone typing
  // into three lines, and stays draggable for anyone who wants it bigger still.
  useAutoGrow(textareaRef, props.value);
  // Maps a mentioned member's id to the exact "@Name " text insertMention() wrote into
  // the draft - ids never appear in the draft's own text, so this is what lets a later
  // edit that deletes the mention (backspace, retyping, cutting a line) be detected and
  // pruned. Without this, deleting "@Bob" from the visible text would still silently
  // notify Bob on submit, since nothing else ever removes an id once added.
  const mentionedTextRef = useRef<Map<string, string>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  const [mentionState, setMentionState] = useState<{ active: boolean; query: string; startIndex: number; top: number; left: number } | null>(null);
  // Was only ever closed by Escape, picking a mention, or the "@query" text no longer
  // matching - clicking anywhere else on the page (another field, a toolbar button)
  // left it open indefinitely.
  useOnClickOutside(containerRef, () => setMentionState(null));

  const workspaceQuery = useQuery({
    queryKey: qk.workspaces(),
    queryFn: async () => {
      const ws = await workspaceApi.listWorkspaces();
      return ws.find(w => w.slug === workspaceSlug);
    },
    enabled: !!workspaceSlug
  });

  const membersQuery = useQuery({
    queryKey: qk.members(workspaceQuery.data?.id),
    queryFn: () => workspaceApi.listMembers(workspaceQuery.data!.id),
    enabled: !!workspaceQuery.data?.id,
  });

  const members = membersQuery.data || [];
  const filteredMembers = members.filter(m => 
    (m.name || "").toLowerCase().includes(mentionState?.query.toLowerCase() || "") ||
    (m.email || "").toLowerCase().includes(mentionState?.query.toLowerCase() || "")
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!mentionState) return;
    if (e.key === 'Escape') {
      setMentionState(null);
      e.preventDefault();
    } else if (e.key === 'Enter' && filteredMembers.length > 0) {
      insertMention(filteredMembers[0]);
      e.preventDefault();
    }
  }

  // Drops any tracked mention whose inserted text is no longer present in the draft,
  // so removing "@Bob " from the message also removes Bob from what gets submitted.
  function pruneRemovedMentions(value: string) {
    let changed = false;
    for (const [memberId, text] of mentionedTextRef.current) {
      if (!value.includes(text)) {
        mentionedTextRef.current.delete(memberId);
        changed = true;
      }
    }
    if (changed) onMentionedIdsChange?.(Array.from(mentionedTextRef.current.keys()));
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    props.onChange(e);
    pruneRemovedMentions(e.target.value);

    const value = e.target.value;
    const cursor = e.target.selectionStart;
    
    // Check if we just typed `@`
    const textBeforeCursor = value.slice(0, cursor);
    const match = textBeforeCursor.match(/@([\w-]*)$/);
    
    if (match) {
      // Crude approximation of cursor position
      setMentionState({
        active: true,
        query: match[1],
        startIndex: match.index!,
        top: 20, // would ideally calculate cursor coordinates
        left: 20,
      });
    } else {
      setMentionState(null);
    }
  }

  function insertMention(member: workspaceApi.MemberOut) {
    if (!mentionState || !textareaRef.current) return;
    
    const before = props.value.slice(0, mentionState.startIndex);
    const after = props.value.slice(textareaRef.current.selectionStart);
    
    const mentionText = `@${member.name || member.email} `;

    const syntheticEvent = {
      target: { value: before + mentionText + after }
    } as React.ChangeEvent<HTMLTextAreaElement>;

    props.onChange(syntheticEvent);
    mentionedTextRef.current.set(member.user_id, mentionText);
    onMentionedIdsChange?.(Array.from(mentionedTextRef.current.keys()));
    setMentionState(null);
    
    // Focus back on textarea and set cursor
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.selectionStart = before.length + mentionText.length;
        textareaRef.current.selectionEnd = before.length + mentionText.length;
      }
    }, 0);
  }

  return (
    <div className="relative w-full" ref={containerRef}>
      <textarea
        {...props}
        ref={textareaRef}
        onChange={handleChange}
        onKeyDown={(e) => {
          handleKeyDown(e);
          if (props.onKeyDown) props.onKeyDown(e);
        }}
      />
      
      {mentionState && filteredMembers.length > 0 && (
        <div
          className="bl-comment-popover"
          role="listbox"
          aria-label="Mention a member"
          style={{ top: "100%", left: 0, minWidth: "200px" }}
        >
          {filteredMembers.map((m) => (
            <button key={m.id} role="option" className="bl-review-menu-row" onClick={() => insertMention(m)} type="button">
              {m.name || m.email}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
