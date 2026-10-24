import * as Sentry from "@sentry/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./lib/i18n";
import App from "./App.tsx";
import { GlobalErrorFallback } from "./app/GlobalErrorFallback.tsx";


// Milestone 12 (docs/tdr/0011): no-op with no DSN configured (no real Sentry project
// exists for this build) - same credential-gated pattern as every optional integration
// in this codebase (VITE_GOOGLE_OAUTH_CLIENT_ID, etc.).
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({ dsn: sentryDsn, environment: import.meta.env.MODE, tracesSampleRate: 0.1 });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={GlobalErrorFallback}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
);
