'use client';

import { useEffect } from 'react';

/** Browser-only Sentry init — avoids pulling @sentry/nextjs server bundle into the client graph. */
export function SentryInit() {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) return;
    void import('@sentry/browser').then((Sentry) => {
      Sentry.init({
        dsn,
        tracesSampleRate: 0.1,
        environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
      });
    });
  }, []);
  return null;
}
