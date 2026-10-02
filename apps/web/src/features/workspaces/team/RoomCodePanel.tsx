import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { useToast } from "../../../components/Toast";
import { qk } from "../../../lib/query-keys";
import * as workspacesApi from "../api";
import type { WorkspaceOut } from "../api";

/**
 * Joining by room code (TDR-0056): one code per workspace that anyone signed in can
 * enter on the Join page. Shown to owners and admins only - the API never sends the
 * code to anyone else.
 */
export function RoomCodePanel({ workspace, compact = false }: { workspace: WorkspaceOut; compact?: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [confirm, setConfirm] = useState<"regenerate" | "disable" | null>(null);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const refresh = () => queryClient.invalidateQueries({ queryKey: qk.workspaces() });
  const generate = useMutation({
    mutationFn: (code?: string) => workspacesApi.setRoomCode(workspace.id, code),
    onSuccess: async (_, code) => {
      await refresh();
      setConfirm(null);
      setCustomOpen(false);
      setCustom("");
      toast(code ? "Room code saved." : "New room code ready to share.", "success");
    },
  });
  const disable = useMutation({
    mutationFn: () => workspacesApi.disableRoomCode(workspace.id),
    onSuccess: async () => {
      await refresh();
      setConfirm(null);
      toast("Joining by code is off. The old code no longer works.");
    },
  });
  const approval = useMutation({
    mutationFn: (value: boolean) => workspacesApi.updateWorkspace(workspace.id, { join_requires_approval: value }),
    onSuccess: refresh,
    onError: (error) => toast(error instanceof Error ? error.message : "Could not change that.", "error"),
  });

  async function copy(kind: "code" | "link") {
    if (!workspace.room_code) return;
    const text = kind === "code" ? workspace.room_code : workspacesApi.joinLink(workspace.room_code);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(null), 1600);
    } catch {
      toast("Couldn't copy. Select the code and copy it by hand.", "warning");
    }
  }

  function submitCustom(event: FormEvent) {
    event.preventDefault();
    if (custom.trim() && !generate.isPending) generate.mutate(custom.trim());
  }

  if (!workspace.room_code) {
    return (
      <div className={`rc-panel is-off${compact ? " is-compact" : ""}`}>
        <div className="rc-off-copy">
          <strong>Let people join with a code</strong>
          <p>
            Share one code in a chat or a meeting and your team signs in and enters it - no
            invite emails. {workspace.join_requires_approval ? "You approve each person first." : "They join straight away."}
          </p>
        </div>
        <button type="button" className="bl-button mint" disabled={generate.isPending} onClick={() => generate.mutate(undefined)}>
          {generate.isPending ? "Turning on…" : "Turn on room code"}
        </button>
        {generate.error && <p className="bl-error" role="alert">{generate.error.message}</p>}
      </div>
    );
  }

  const groups = workspace.room_code.split("-");
  return (
    <div className={`rc-panel${compact ? " is-compact" : ""}`}>
      <div className="rc-code-row">
        <div className="rc-code" aria-label={`Room code ${workspace.room_code}`}>
          {groups.map((group, index) => (
            <span key={`${group}-${index}`} className="rc-group">
              {group.split("").map((char, i) => (
                <b key={i}>{char}</b>
              ))}
            </span>
          ))}
        </div>
        <div className="rc-copy-actions">
          <button type="button" className="bl-button" onClick={() => void copy("code")}>
            {copied === "code" ? "Copied" : "Copy code"}
          </button>
          <button type="button" className="bl-quiet" onClick={() => void copy("link")}>
            {copied === "link" ? "Link copied" : "Copy join link"}
          </button>
        </div>
      </div>
      <p className="rc-hint">
        People sign in, open <span className="bl-mono">/join</span> and enter this code - or open the join link.
      </p>

      <label className="bl-setting-row compact">
        <span className="bl-setting-copy">
          <strong>Approve each person</strong>
          <span>
            {workspace.join_requires_approval
              ? "Requests wait on the Members page until an owner or admin lets them in."
              : "Anyone with the code joins as a member straight away."}
          </span>
        </span>
        <input
          type="checkbox"
          className="bl-switch-input"
          checked={workspace.join_requires_approval}
          disabled={approval.isPending}
          onChange={(event) => approval.mutate(event.target.checked)}
          aria-label="Require approval for people joining with the code"
        />
        <span className="bl-switch" aria-hidden="true"><i /></span>
      </label>

      {customOpen ? (
        <form className="rc-custom" onSubmit={submitCustom}>
          <input
            className="bl-input bl-mono"
            autoFocus
            value={custom}
            maxLength={40}
            onChange={(event) => setCustom(event.target.value.toUpperCase())}
            placeholder="ACME-STUDIO"
            aria-label="Custom room code"
          />
          <button type="submit" className="bl-button" disabled={!custom.trim() || generate.isPending}>
            {generate.isPending ? "Saving…" : "Use this code"}
          </button>
          <button type="button" className="bl-quiet" onClick={() => setCustomOpen(false)}>Cancel</button>
          <small>6-32 letters or numbers; hyphens can separate groups. Short custom codes are easier to guess.</small>
        </form>
      ) : (
        <div className="rc-manage">
          <button type="button" className="bl-text-link" onClick={() => setConfirm("regenerate")}>New random code</button>
          <button type="button" className="bl-text-link" onClick={() => setCustomOpen(true)}>Choose a code</button>
          <button type="button" className="bl-text-link danger" onClick={() => setConfirm("disable")}>Turn off</button>
        </div>
      )}
      {(generate.error || disable.error) && (
        <p className="bl-error" role="alert">{(generate.error ?? disable.error)?.message}</p>
      )}

      {confirm === "regenerate" && (
        <ConfirmDialog
          title="Replace the room code?"
          message="The current code stops working right away. Anyone you've already shared it with will need the new one."
          confirmLabel={generate.isPending ? "Replacing…" : "Replace code"}
          pending={generate.isPending}
          onConfirm={() => generate.mutate(undefined)}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === "disable" && (
        <ConfirmDialog
          title="Turn off joining by code?"
          message="The code stops working. Requests already waiting stay on the Members page for you to decide."
          confirmLabel={disable.isPending ? "Turning off…" : "Turn off"}
          destructive
          pending={disable.isPending}
          onConfirm={() => disable.mutate()}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
