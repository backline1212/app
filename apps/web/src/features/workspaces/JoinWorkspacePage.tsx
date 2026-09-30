import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../../components/Toast";
import { qk } from "../../lib/query-keys";
import { useDocumentTitle } from "../../lib/use-document-title";
import * as workspacesApi from "./api";

export function JoinWorkspacePage() {
  useDocumentTitle(["Join Workspace"]);
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [roomCode, setRoomCode] = useState("");

  const joinMutation = useMutation({
    mutationFn: (code: string) => workspacesApi.submitJoinRequest(code),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: qk.workspaces() });
      if (res.status === "joined") {
        toast("You have successfully joined the workspace.", "success");
        navigate("/");
      } else {
        toast("Your request to join has been sent. An admin must approve it.", "success");
        navigate("/");
      }
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : "Could not join workspace.", "error");
    },
  });

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", backgroundColor: "var(--color-bg)" }}>
      <div className="bl-attention" style={{ padding: "40px", width: "100%", maxWidth: "400px", textAlign: "center" }}>
        <h1 style={{ marginBottom: "16px", fontSize: "24px" }}>Join a Workspace</h1>
        <p className="bl-mono" style={{ marginBottom: "32px", color: "var(--color-text-secondary)" }}>
          Enter the room code provided by your admin to request access.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (roomCode.trim()) joinMutation.mutate(roomCode.trim());
          }}
          style={{ display: "flex", flexDirection: "column", gap: "16px" }}
        >
          <input
            autoFocus
            className="bl-input"
            placeholder="Room Code (e.g. ALPHA123)"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value)}
            disabled={joinMutation.isPending}
            style={{ textAlign: "center", textTransform: "uppercase", letterSpacing: "1px" }}
          />
          <button
            type="submit"
            className="bl-button mint"
            disabled={!roomCode.trim() || joinMutation.isPending}
            style={{ width: "100%", justifyContent: "center" }}
          >
            {joinMutation.isPending ? "Joining…" : "Join"}
          </button>
        </form>
        <button
          className="bl-button ghost"
          onClick={() => navigate("/")}
          style={{ width: "100%", justifyContent: "center", marginTop: "16px" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
