import { Component, type ReactNode } from "react";

/** A widget failure hides the widget and never reaches the portal (NFR-REL-06, UC-01 6a). */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("[LexisFlow] widget error", error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
