// Sentry is loaded only when VITE_SENTRY_DSN is set (TDR-0205): without a DSN it did
// nothing but was still in every visitor's first download.
type SentryModule = typeof import("@sentry/react");

const dsn = import.meta.env.VITE_SENTRY_DSN;
let loading: Promise<SentryModule | null> | null = null;

function sentry(): Promise<SentryModule | null> {
  if (!dsn) return Promise.resolve(null);
  loading ??= import("@sentry/react")
    .then((module) => {
      module.init({ dsn, environment: import.meta.env.MODE, tracesSampleRate: 0.1 });
      return module;
    })
    .catch(() => null);
  return loading;
}

// Content-Security-Policy violations on the dashboard (TDR-0224). The policy lives in
// vercel.json, on a different origin from the API, so instead of a report-uri the
// browser's own event is forwarded - once per directive and blocked origin, at most
// ten a page, so a looping script can't flood the project.
const reportedViolations = new Set<string>();

function blockedOrigin(uri: string): string {
  try {
    return new URL(uri).origin;
  } catch {
    return uri; // "inline", "eval", "data" and similar keywords
  }
}

function reportCspViolation(event: SecurityPolicyViolationEvent): void {
  const blocked = blockedOrigin(event.blockedURI);
  const key = `${event.effectiveDirective} ${blocked}`;
  if (reportedViolations.has(key) || reportedViolations.size >= 10) return;
  reportedViolations.add(key);
  void sentry().then((module) => module?.captureMessage(`CSP blocked ${event.effectiveDirective}: ${blocked}`, {
    level: "warning",
    tags: { csp_directive: event.effectiveDirective, csp_disposition: event.disposition },
    extra: { blocked, source: event.sourceFile ? blockedOrigin(event.sourceFile) : null, line: event.lineNumber },
  }));
}

/** Starts error reporting after the app has rendered; a no-op without a DSN. */
export function startErrorReporting(): void {
  if (!dsn) return;
  document.addEventListener("securitypolicyviolation", reportCspViolation);
  const start = () => void sentry();
  if ("requestIdleCallback" in window) window.requestIdleCallback(start, { timeout: 3000 });
  else setTimeout(start, 1000);
}

/** Reports a render error; resolves to the event id, or null when reporting is off. */
export async function reportRenderError(error: unknown, componentStack?: string | null): Promise<string | null> {
  const module = await sentry();
  if (!module) return null;
  return module.captureException(error, { contexts: { react: { componentStack: componentStack ?? "" } } });
}
