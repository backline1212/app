// Mirrors apps/widget/src/recorder.ts (the widget is a separate bundle the dashboard
// does not import). Keep the two in step.
// Screen and voice recording for the comment composer. Everything is explicit: the
// browser's own picker asks what to share, a visible timer runs while recording, and
// the reviewer stops it (or the browser's "Stop sharing" does). The result is a File
// handed to the composer's normal attachment upload - nothing is uploaded while
// recording. Kept under the 20 MiB upload cap by duration and bitrate limits.

export type RecordingKind = "screen" | "voice";

export interface RecordingHandle {
  /** Resolves with the finished recording, or null when nothing was captured. */
  done: Promise<File | null>;
  stop: () => void;
  cancel: () => void;
  elapsedSeconds: () => number;
}

export const MAX_RECORDING_SECONDS = 120;
const MAX_RECORDING_BYTES = 19 * 1024 * 1024;

export function recordingSupported(kind: RecordingKind): boolean {
  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices) return false;
  return kind === "screen" ? typeof navigator.mediaDevices.getDisplayMedia === "function" : typeof navigator.mediaDevices.getUserMedia === "function";
}

function pickMimeType(kind: RecordingKind): string {
  const candidates = kind === "screen"
    ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]
    : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return candidates.find(type => MediaRecorder.isTypeSupported(type)) ?? "";
}

function baseType(mimeType: string, kind: RecordingKind): string {
  const base = mimeType.split(";")[0];
  if (base) return base;
  return kind === "screen" ? "video/webm" : "audio/webm";
}

function extensionFor(type: string): string {
  return ({ "video/webm": "webm", "video/mp4": "mp4", "audio/webm": "weba", "audio/mp4": "m4a", "audio/ogg": "ogg" } as Record<string, string>)[type] ?? "webm";
}

/** Asks for the screen (with tab/system audio when offered, plus the microphone when
 * `withMicrophone`) or the microphone alone, then records until stopped. Rejects if
 * the reviewer declines the browser prompt. */
export async function startRecording(kind: RecordingKind, withMicrophone = kind === "voice"): Promise<RecordingHandle> {
  if (!recordingSupported(kind)) throw new Error(kind === "screen" ? "This browser can't record the screen." : "This browser can't record audio.");
  const streams: MediaStream[] = [];
  const stopTracks = () => { for (const stream of streams) for (const track of stream.getTracks()) track.stop(); };
  let audioContext: AudioContext | null = null;
  let stream: MediaStream;
  try {
    if (kind === "screen") {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 24 } }, audio: true });
      streams.push(display);
      let mic: MediaStream | null = null;
      if (withMicrophone) {
        mic = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
        if (mic) streams.push(mic);
      }
      const audioSources = [display, mic].filter((s): s is MediaStream => !!s && s.getAudioTracks().length > 0);
      if (audioSources.length > 1) {
        // Mix tab/system audio and the microphone into one track.
        audioContext = new AudioContext();
        const destination = audioContext.createMediaStreamDestination();
        for (const source of audioSources) audioContext.createMediaStreamSource(source).connect(destination);
        stream = new MediaStream([...display.getVideoTracks(), ...destination.stream.getAudioTracks()]);
      } else {
        stream = new MediaStream([...display.getVideoTracks(), ...(audioSources[0]?.getAudioTracks() ?? [])]);
      }
    } else {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streams.push(stream);
    }
  } catch (error) {
    stopTracks();
    void audioContext?.close();
    if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "AbortError")) {
      throw new Error(kind === "screen" ? "Screen recording was cancelled." : "Microphone access was not allowed.");
    }
    throw error instanceof Error ? error : new Error("Recording could not start.");
  }

  const mimeType = pickMimeType(kind);
  const recorder = new MediaRecorder(stream, {
    ...(mimeType ? { mimeType } : {}),
    ...(kind === "screen" ? { videoBitsPerSecond: 900_000, audioBitsPerSecond: 96_000 } : { audioBitsPerSecond: 64_000 }),
  });
  const chunks: Blob[] = [];
  let bytes = 0;
  let cancelled = false;
  const startedAt = performance.now();
  let stoppedAt: number | null = null;

  const done = new Promise<File | null>((resolve) => {
    recorder.ondataavailable = (event) => {
      if (!event.data.size) return;
      chunks.push(event.data);
      bytes += event.data.size;
      if (bytes >= MAX_RECORDING_BYTES && recorder.state === "recording") recorder.stop();
    };
    recorder.onstop = () => {
      stoppedAt ??= performance.now();
      window.clearTimeout(limit);
      stopTracks();
      void audioContext?.close();
      if (cancelled || chunks.length === 0) { resolve(null); return; }
      const type = baseType(recorder.mimeType || mimeType, kind);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const name = `${kind === "screen" ? "screen-recording" : "voice-note"}-${stamp}.${extensionFor(type)}`;
      resolve(new File(chunks, name, { type }));
    };
  });
  // The browser's own "Stop sharing" ends the video track; finish the recording then.
  for (const track of stream.getVideoTracks()) track.addEventListener("ended", () => { if (recorder.state !== "inactive") recorder.stop(); });
  const limit = window.setTimeout(() => { if (recorder.state !== "inactive") recorder.stop(); }, MAX_RECORDING_SECONDS * 1000);
  recorder.start(1000);

  return {
    done,
    stop: () => { if (recorder.state !== "inactive") { stoppedAt = performance.now(); recorder.stop(); } },
    cancel: () => { cancelled = true; if (recorder.state !== "inactive") recorder.stop(); else { stopTracks(); void audioContext?.close(); } },
    elapsedSeconds: () => Math.floor(((stoppedAt ?? performance.now()) - startedAt) / 1000),
  };
}

export function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
