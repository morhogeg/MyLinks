'use client';

import React from 'react';

interface Props {
  children: React.ReactNode;
  /** Optional custom fallback; receives a reset callback. */
  fallback?: (reset: () => void) => React.ReactNode;
  /** Label used in the console log to locate which boundary tripped. */
  label?: string;
}

interface State {
  hasError: boolean;
}

/**
 * Component-level error boundary. Wrap a subtree (e.g. the Feed or the modal
 * layer) so a render throw inside it shows a small inline recovery UI instead of
 * bubbling to the route boundary and swapping the whole page. React only has a
 * class-based API for `componentDidCatch`, so this stays a class component.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`ErrorBoundary${this.props.label ? ` [${this.props.label}]` : ''} caught:`, error, info);
  }

  reset = () => this.setState({ hasError: false });

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback(this.reset);
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
          <p className="text-sm text-text-secondary">
            This section ran into a problem.
          </p>
          <button
            onClick={this.reset}
            className="inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium text-white"
            style={{ background: 'var(--accent-gradient)' }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
