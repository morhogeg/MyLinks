'use client';

import { useEffect } from 'react';

/**
 * Route-level error boundary (Next.js App Router). Catches render/runtime errors
 * thrown anywhere in the page tree so a single throw no longer white-screens the
 * whole SPA — the user gets a recoverable screen with a "Try again" reset.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface for diagnostics; real logging can hook in here later.
    console.error('Route error boundary caught:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-md w-full text-center">
        <h1 className="text-xl font-semibold text-text mb-2">
          Something went wrong
        </h1>
        <p className="text-sm text-text-secondary mb-6">
          The app hit an unexpected error. Your saved data is safe — try again.
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-medium text-white"
          style={{ background: 'var(--accent-gradient)' }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
