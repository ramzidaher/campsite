'use client';

import { Analytics } from '@vercel/analytics/react';

/** Only loads the script when `NEXT_PUBLIC_VERCEL_ANALYTICS=1` (avoids 404 + console noise when Web Analytics is off or blocked). */
export function VercelAnalyticsGate() {
  if (process.env.NEXT_PUBLIC_VERCEL_ANALYTICS !== '1') return null;
  return <Analytics />;
}
