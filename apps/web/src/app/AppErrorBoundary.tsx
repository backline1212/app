import { Component, type ErrorInfo, type ReactNode } from "react";

import { reportRenderError } from "../lib/error-reporting";

export interface ErrorFallbackProps {
  error: unknown;
  /** Set once the error was reported; null when reporting is off. */
  eventId: string | null;
  resetError: () => void;
}

interface State {
  error: unknown;
  eventId: string | null;
}

/** The app-wide error boundary (replaces Sentry's, so Sentry can load lazily). */
export class AppErrorBoundary extends Component<{ fallback: (props: ErrorFallbackProps) => ReactNode; children: ReactNode }, State> {
  state: State = { error: null, eventId: null };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error ?? new Error("Unknown error") };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    void reportRenderError(error, info.componentStack).then((eventId) => {
      if (eventId && this.state.error === error) this.setState({ eventId });
    });
  }

  private resetError = () => this.setState({ error: null, eventId: null });

  render(): ReactNode {
    if (this.state.error) {
      return this.props.fallback({ error: this.state.error, eventId: this.state.eventId, resetError: this.resetError });
    }
    return this.props.children;
  }
}
