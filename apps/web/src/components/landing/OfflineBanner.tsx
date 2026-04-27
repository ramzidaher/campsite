'use client';

import { useEffect, useState } from 'react';

export function OfflineBanner() {
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
    <div role="status" aria-live="polite" className="landing-offline-banner">
      You&apos;re offline - showing cached data where available. Actions will sync when you reconnect.
    </div>
  );
}
