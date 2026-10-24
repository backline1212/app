import { useEffect, useRef, useState } from "react";
import { formatDuration, MAX_RECORDING_SECONDS, recordingSupported, startRecording, type RecordingHandle, type RecordingKind } from "../../lib/screen-recorder";

/** "Record screen" / "Voice note" for a comment or reply composer. The finished
 * recording is handed to `onRecorded` as a File for the composer's normal upload. */
export function RecordButtons({ disabled, onRecorded, onRecordingChange, className = "bl-cd-shot-add" }: {
  disabled?: boolean;
  onRecorded: (file: File) => void;
  onRecordingChange?: (recording: boolean) => void;
  className?: string;
}) {
  const [active, setActive] = useState<RecordingKind | null>(null);
  const [starting, setStarting] = useState<RecordingKind | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [message, setMessage] = useState("");
  const handle = useRef<RecordingHandle | null>(null);
  const onRecordedRef = useRef(onRecorded);
  onRecordedRef.current = onRecorded;
  const onChangeRef = useRef(onRecordingChange);
  onChangeRef.current = onRecordingChange;

  useEffect(() => () => { handle.current?.cancel(); }, []);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setElapsed(handle.current?.elapsedSeconds() ?? 0), 500);
    return () => window.clearInterval(timer);
  }, [active]);

  async function toggle(kind: RecordingKind) {
    if (active) { if (active === kind) handle.current?.stop(); return; }
    setMessage("");
    setStarting(kind);
    let recording: RecordingHandle;
    try {
      recording = await startRecording(kind, true);
    } catch (error) {
      setStarting(null);
      setMessage(error instanceof Error ? error.message : "Recording could not start.");
      return;
    }
    handle.current = recording;
    setStarting(null);
    setElapsed(0);
    setActive(kind);
    onChangeRef.current?.(true);
    const file = await recording.done;
    if (handle.current !== recording) return;
    handle.current = null;
    setActive(null);
    onChangeRef.current?.(false);
    if (file) onRecordedRef.current(file);
    else setMessage("Nothing was recorded.");
  }

  const kinds = (["screen", "voice"] as const).filter(recordingSupported);
  if (kinds.length === 0) return null;
  return <>
    {kinds.map((kind) => {
      const recordingThis = active === kind;
      return <button
        key={kind}
        type="button"
        className={`${className} bl-record-button${recordingThis ? " is-recording" : ""}`}
        disabled={(disabled && !recordingThis) || (active !== null && !recordingThis) || starting !== null}
        aria-pressed={recordingThis}
        title={recordingThis ? "Stop recording" : kind === "screen" ? `Record your screen and voice (up to ${MAX_RECORDING_SECONDS / 60} min)` : `Record a voice note (up to ${MAX_RECORDING_SECONDS / 60} min)`}
        onClick={() => void toggle(kind)}
      >
        {recordingThis
          ? <svg width={13} height={13} viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /></svg>
          : kind === "screen"
            ? <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" fill="currentColor" /></svg>
            : <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></svg>}
        {recordingThis ? `Stop · ${formatDuration(elapsed)}` : starting === kind ? "Starting…" : kind === "screen" ? "Record screen" : "Voice note"}
      </button>;
    })}
    {message && <span className="bl-record-message" role="status">{message}</span>}
  </>;
}

/** Plays a recorded attachment inline. */
export function MediaAttachment({ url, filename, contentType }: { url: string; filename: string; contentType: string }) {
  return contentType.startsWith("video/")
    ? <video className="bl-media-attachment" controls preload="metadata" src={url} title={filename} />
    : <audio className="bl-media-attachment is-audio" controls preload="metadata" src={url} title={filename} />;
}

interface DiagnosticsData {
  console?: { level: string; message: string; at: string }[];
  network?: { method: string; url: string; status: number; duration_ms?: number | null; at: string }[];
}

/** The console & network failures a reviewer attached, plus any reproduction steps. */
export function CommentDiagnostics({ context }: { context: unknown }) {
  const data = (context ?? {}) as { diagnostics?: DiagnosticsData; steps_to_reproduce?: string };
  const consoleEntries = data.diagnostics?.console ?? [];
  const networkEntries = data.diagnostics?.network ?? [];
  if (!data.steps_to_reproduce && consoleEntries.length === 0 && networkEntries.length === 0) return null;
  const errors = consoleEntries.filter((entry) => entry.level === "error").length;
  return <div className="bl-diagnostics">
    {data.steps_to_reproduce && <div className="bl-diagnostics-steps">
      <strong>Steps to reproduce</strong>
      <p>{data.steps_to_reproduce}</p>
    </div>}
    {(consoleEntries.length > 0 || networkEntries.length > 0) && <details>
      <summary>
        Console & network
        <span>{[errors ? `${errors} error${errors === 1 ? "" : "s"}` : "", consoleEntries.length - errors ? `${consoleEntries.length - errors} warning${consoleEntries.length - errors === 1 ? "" : "s"}` : "", networkEntries.length ? `${networkEntries.length} failed request${networkEntries.length === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ")}</span>
      </summary>
      <ol>
        {[...consoleEntries.map((entry) => ({ at: entry.at, node: <><em className={`is-${entry.level}`}>{entry.level}</em><code>{entry.message}</code></> })),
          ...networkEntries.map((entry) => ({ at: entry.at, node: <><em className="is-network">{entry.status || "failed"}</em><code>{entry.method} {entry.url}{entry.duration_ms != null ? ` · ${Math.round(entry.duration_ms)} ms` : ""}</code></> }))]
          .sort((a, b) => a.at.localeCompare(b.at))
          .map((row, index) => <li key={index}><time dateTime={row.at}>{new Date(row.at).toLocaleTimeString()}</time>{row.node}</li>)}
      </ol>
    </details>}
  </div>;
}
