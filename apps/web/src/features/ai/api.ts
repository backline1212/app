import { ApiError, apiFetch } from "../../lib/api-client";

export async function summarizeThread(workspaceId: string, projectId: string, commentId: string): Promise<{ summary: string }> {
  return apiFetch(`/api/workspaces/${workspaceId}/projects/${projectId}/comments/${commentId}/ai/summarize`, {
    method: "POST"
  });
}

export async function suggestReply(workspaceId: string, projectId: string, commentId: string): Promise<{ suggestions: string[] }> {
  return apiFetch(`/api/workspaces/${workspaceId}/projects/${projectId}/comments/${commentId}/ai/suggest-reply`, {
    method: "POST"
  });
}

// The backend puts every configured Groq key through a small pool (docs/tdr/0034):
// once all of them are mid-request or cooling down from a rate-limit rejection, it
// returns AI_SERVICE_BUSY (503) rather than an error, since nothing actually went
// wrong - there's just no spare capacity for a moment. Every AI action surfaces that
// distinctly instead of the same generic failure text a real error would get.
export function aiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.code === "AI_SERVICE_BUSY") {
    return "AI is busy right now — try again in a moment.";
  }
  return fallback;
}
