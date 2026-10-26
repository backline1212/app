import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./lib/i18n";
import App from "./App.tsx";
import { AppErrorBoundary } from "./app/AppErrorBoundary.tsx";
import { GlobalErrorFallback } from "./app/GlobalErrorFallback.tsx";
import { startErrorReporting } from "./lib/error-reporting";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary fallback={GlobalErrorFallback}>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);

// Milestone 12 (docs/tdr/0011, TDR-0205): a no-op without VITE_SENTRY_DSN; with one,
// Sentry loads once the page is idle.
startErrorReporting();
