import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { aiErrorMessage, analyzeProject, type ProjectAnalysisResult } from "../../ai/api";
import { qk } from "../../../lib/query-keys";
import { ticketRef } from "../../../lib/ticket-ref";
import { PRIORITY_META } from "./comments/types";
import { SparkleIcon } from "./icons";

const CHECKS = [
  "Reads every open comment in this project",
  "Prioritises issues by severity",
  "Summarises page progress at a glance",
];

interface AiTabProps {
  workspaceId: string;
  projectId: string;
  /** Switches the drawer to the Comments tab with this comment selected - used when a
   * finding or duplicate pair is clicked so the reviewer can act on it directly. */
  onViewComment?: (commentId: string) => void;
}

// Backed by backend/app/modules/ai/service.py's analyze_project (docs/tdr/0043):
// real Groq calls through the same key pool the thread Summarize/Suggest Replies
// actions already use. No usage is metered or billed - same honesty contract those
// two surfaces already follow.
export function AiTab({ workspaceId, projectId, onViewComment }: AiTabProps) {
  const queryClient = useQueryClient();
  const [result, setResult] = useState<ProjectAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze() {
    setIsAnalyzing(true);
    setError(null);
    try {
      const res = await analyzeProject(workspaceId, projectId);
      setResult(res);
      if ((res.findings ?? []).length > 0) {
        queryClient.invalidateQueries({ queryKey: qk.projectComments(projectId) });
      }
    } catch (err) {
      setError(aiErrorMessage(err, "Could not analyze this project right now."));
    } finally {
      setIsAnalyzing(false);
    }
  }

  const disabled = result?.summary.startsWith("[AI Disabled]") ?? false;

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <span
          style={{
            display: "flex",
            width: 56,
            height: 56,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 3,
            background: "var(--ink)",
            color: "var(--mint)",
          }}
        >
          <SparkleIcon width={26} height={26} stroke="none" fill="currentColor" />
        </span>
        <h3 className="text-lg font-semibold">
          {result ? "BugHunt AI" : "Welcome to BugHunt AI"}
        </h3>
      </div>

      {!result && (
        <ul className="flex flex-col gap-3 self-stretch text-left">
          {CHECKS.map((check) => (
            <li key={check} className="flex items-start gap-2.5 text-sm">
              <svg
                viewBox="0 0 20 20"
                width="18"
                height="18"
                fill="none"
                className="mt-0.5 shrink-0"
                style={{ color: "var(--mint-deep)" }}
                aria-hidden="true"
              >
                <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
                <path
                  d="M6 10.5 8.8 13 14 7.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {check}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="bl-error">
          {error}
        </p>
      )}

      {result && !disabled && (
        <div className="flex flex-col gap-5 text-left">
          <div className="bl-attention" style={{ padding: 10, borderRadius: 4 }}>
            <strong>✨ Summary:</strong>
            <p style={{ marginTop: 4 }}>{result.summary}</p>
          </div>

          {(result.findings ?? []).length > 0 && (
            <div>
              <h4 className="bl-group-title">Needs attention</h4>
              <ul className="flex flex-col gap-2" style={{ marginTop: 8 }}>
                {(result.findings ?? []).map((finding) => {
                  const meta = PRIORITY_META[finding.severity];
                  return (
                    <li key={finding.comment_id}>
                      <button
                        type="button"
                        className="bl-quiet"
                        style={{ display: "flex", gap: 8, textAlign: "left", width: "100%" }}
                        onClick={() => onViewComment?.(finding.comment_id)}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            marginTop: 5,
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: meta.color,
                            flexShrink: 0,
                          }}
                        />
                        <span>
                          <strong>{meta.label}</strong>{" "}
                          {ticketRef({ ticket_number: finding.ticket_number, id: finding.comment_id })}
                          <br />
                          <span className="bl-inline-note">{finding.reason}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {(result.possible_duplicates ?? []).length > 0 && (
            <div>
              <h4 className="bl-group-title">Possible duplicates</h4>
              <ul className="flex flex-col gap-2" style={{ marginTop: 8 }}>
                {(result.possible_duplicates ?? []).map((pair, idx) => (
                  <li key={`${pair.comment_id_a}-${pair.comment_id_b}-${idx}`}>
                    <div style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
                      <button type="button" className="bl-quiet" onClick={() => onViewComment?.(pair.comment_id_a)}>
                        {ticketRef({ ticket_number: pair.ticket_number_a, id: pair.comment_id_a })}
                      </button>
                      <span>↔</span>
                      <button type="button" className="bl-quiet" onClick={() => onViewComment?.(pair.comment_id_b)}>
                        {ticketRef({ ticket_number: pair.ticket_number_b, id: pair.comment_id_b })}
                      </button>
                    </div>
                    <span className="bl-inline-note">{pair.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {result && disabled && <p className="bl-inline-note">{result.summary}</p>}

      <p className="bl-inline-note">
        {result
          ? "Runs against your configured Groq keys. No usage is metered or billed."
          : "Analysis runs against your configured Groq keys. No usage is metered or billed."}
      </p>

      <button
        type="button"
        className="bl-button mint"
        style={{ width: "100%" }}
        onClick={handleAnalyze}
        disabled={isAnalyzing}
      >
        {isAnalyzing ? "Analyzing..." : result ? "Re-analyze" : "Analyze this project"}
      </button>
    </div>
  );
}
