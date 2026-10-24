// Console & network error capture for "Attach console & network errors" in the
// composer. Only failures are kept - console.error/warn, uncaught errors and
// rejections, and requests that came back >= 400 or never completed - in two small
// ring buffers held in memory. Nothing is sent anywhere until the reviewer posts a
// comment with the box ticked. Query strings, fragments and obvious secrets are
// stripped here and again on the server (comments/diagnostics.py).

export interface ConsoleEntry {
  level: "error" | "warn";
  message: string;
  at: string;
}

export interface NetworkEntry {
  method: string;
  url: string;
  status: number;
  duration_ms: number | null;
  at: string;
}

export interface Diagnostics {
  console: ConsoleEntry[];
  network: NetworkEntry[];
}

export type DiagnosticEntry =
  | ({ kind: "console" } & ConsoleEntry)
  | ({ kind: "network" } & NetworkEntry);

const MAX_ENTRIES = 50;
const MAX_MESSAGE = 1_000;
const consoleEntries: ConsoleEntry[] = [];
const networkEntries: NetworkEntry[] = [];
const listeners = new Set<() => void>();

const SECRET_PATTERNS: [RegExp, string][] = [
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[token]"],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [redacted]"],
  [/(["']?\b(?:access[_-]?token|refresh[_-]?token|id[_-]?token|token|api[_-]?key|apikey|secret|client[_-]?secret|password|passwd|pwd|session(?:[_-]?id)?|auth(?:orization)?|signature|sig|code)\b["']?\s*[:=]\s*["']?)([^"'\s&,;}]+)/gi, "$1[redacted]"],
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[email]"],
];

export function scrubText(text: string): string {
  let result = text;
  for (const [pattern, replacement] of SECRET_PATTERNS) result = result.replace(pattern, replacement);
  return result;
}

/** Origin + path only: query strings and fragments routinely carry tokens. */
export function stripUrl(raw: string): string {
  try {
    const url = new URL(raw, location.href);
    return scrubText(`${url.origin}${url.pathname}`);
  } catch {
    return scrubText(raw.split(/[?#]/, 1)[0]);
  }
}

function describe(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === "string") return value;
  if (value === undefined) return "undefined";
  try {
    const json = JSON.stringify(value);
    return json === undefined ? String(value) : json;
  } catch {
    return String(value);
  }
}

function notify(): void {
  for (const listener of listeners) {
    try { listener(); } catch { /* A broken listener must not break the page. */ }
  }
}

/** Adds one entry - from this page's own hooks or, for the extension, relayed from
 * the page's main world by its content script. */
export function recordDiagnostic(entry: DiagnosticEntry): void {
  if (entry.kind === "console") {
    const message = scrubText(String(entry.message ?? "")).slice(0, MAX_MESSAGE);
    if (!message) return;
    consoleEntries.push({ level: entry.level === "warn" ? "warn" : "error", message, at: entry.at });
    if (consoleEntries.length > MAX_ENTRIES) consoleEntries.shift();
  } else {
    networkEntries.push({
      method: String(entry.method || "GET").toUpperCase().slice(0, 16),
      url: stripUrl(String(entry.url ?? "")).slice(0, 2_000),
      status: Math.max(0, Math.min(999, Math.round(Number(entry.status) || 0))),
      duration_ms: entry.duration_ms == null ? null : Math.max(0, Math.round(entry.duration_ms)),
      at: entry.at,
    });
    if (networkEntries.length > MAX_ENTRIES) networkEntries.shift();
  }
  notify();
}

export function diagnosticsSnapshot(): Diagnostics | null {
  if (consoleEntries.length === 0 && networkEntries.length === 0) return null;
  return { console: consoleEntries.map(e => ({ ...e })), network: networkEntries.map(e => ({ ...e })) };
}

export function diagnosticsSummary(): { errors: number; warnings: number; requests: number } {
  return {
    errors: consoleEntries.filter(e => e.level === "error").length,
    warnings: consoleEntries.filter(e => e.level === "warn").length,
    requests: networkEntries.length,
  };
}

export function onDiagnosticsChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

let installed = false;

/** Hooks the console, error events, fetch and XMLHttpRequest of the current realm.
 * Idempotent. The widget calls it in the reviewed page; the extension runs the same
 * hooks in the page's main world (main-world.ts) and relays entries back. `emit`
 * defaults to recording locally. */
export function installDiagnosticsCapture(options: { emit?: (entry: DiagnosticEntry) => void; ignoreUrlPrefix?: string } = {}): void {
  if (installed) return;
  installed = true;
  const emit = options.emit ?? recordDiagnostic;
  const now = () => new Date().toISOString();
  // The widget's own requests to Backline aren't the site's errors.
  const ignore = options.ignoreUrlPrefix ? new URL(options.ignoreUrlPrefix, location.href).href : null;
  const ownRequest = (url: string) => {
    if (!ignore) return false;
    try { return new URL(url, location.href).href.startsWith(ignore); } catch { return false; }
  };

  for (const level of ["error", "warn"] as const) {
    const original = console[level];
    console[level] = function (...args: unknown[]) {
      try {
        const message = args.map(describe).join(" ");
        if (!message.includes("[Backline]")) emit({ kind: "console", level, message, at: now() });
      } catch { /* never break the page's logging */ }
      return original.apply(this, args);
    };
  }
  window.addEventListener("error", (event) => {
    if (event.error || event.message) {
      const where = event.filename ? ` (${stripUrl(event.filename)}:${event.lineno})` : "";
      emit({ kind: "console", level: "error", message: `Uncaught ${describe(event.error ?? event.message)}${where}`, at: now() });
    }
  });
  window.addEventListener("unhandledrejection", (event) => {
    emit({ kind: "console", level: "error", message: `Unhandled rejection: ${describe(event.reason)}`, at: now() });
  });

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
      const started = performance.now();
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      try {
        const response = await originalFetch.call(this, input, init);
        if (response.status >= 400 && !ownRequest(url)) {
          emit({ kind: "network", method, url, status: response.status, duration_ms: performance.now() - started, at: now() });
        }
        return response;
      } catch (error) {
        if (!ownRequest(url) && !(error instanceof DOMException && error.name === "AbortError")) {
          emit({ kind: "network", method, url, status: 0, duration_ms: performance.now() - started, at: now() });
        }
        throw error;
      }
    };
  }

  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  const meta = new WeakMap<XMLHttpRequest, { method: string; url: string; started: number }>();
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    meta.set(this, { method, url: String(url), started: 0 });
    return (open as (...args: unknown[]) => void).call(this, method, url, ...rest);
  } as typeof XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    const info = meta.get(this);
    if (info) {
      info.started = performance.now();
      let aborted = false;
      this.addEventListener("abort", () => { aborted = true; });
      this.addEventListener("loadend", () => {
        if (!aborted && (this.status >= 400 || this.status === 0) && !ownRequest(info.url)) {
          emit({ kind: "network", method: info.method, url: info.url, status: this.status, duration_ms: performance.now() - info.started, at: now() });
        }
      });
    }
    return send.call(this, body);
  };
}
