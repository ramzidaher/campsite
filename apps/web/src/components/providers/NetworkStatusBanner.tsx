'use client';

import { useEffect, useState } from 'react';

/**
 * Shown when the browser reports offline. Cached React Query data may still be visible (stale-while-revalidate).
 */
export function NetworkStatusBanner() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-amber-500/50 bg-amber-500/15 px-4 py-2 text-center text-sm text-amber-100"
    >
      You&apos;re offline — showing cached data where available. Actions will sync when you reconnect.
    </div>
  );
}
