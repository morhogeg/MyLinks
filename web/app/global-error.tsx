'use client';

import { useEffect } from 'react';

/**
 * Global error boundary (Next.js App Router). This is the last line of defense:
 * it catches errors thrown in the root layout itself, which `app/error.tsx`
 * cannot. It replaces the entire document, so it must render its own <html>/
 * <body>. Kept dependency-free and inline-styled since app CSS/providers may be
 * exactly what failed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global error boundary caught:', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0a',
          color: '#ededed',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '1.5rem',
        }}
      >
        <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: '0.875rem', opacity: 0.7, marginBottom: '1.5rem' }}>
            The app hit an unexpected error. Your saved data is safe — try again.
          </p>
          <button
            onClick={reset}
            style={{
              border: 'none',
              borderRadius: '9999px',
              padding: '0.625rem 1.25rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: '#fff',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
