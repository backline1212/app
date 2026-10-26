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

/** Starts error reporting after the app has rendered; a no-op without a DSN. */
export function startErrorReporting(): void {
  if (!dsn) return;
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
