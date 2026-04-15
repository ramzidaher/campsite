'use client';

import { useEffect, useRef } from 'react';

/** App-level event key for optional shell refresh broadcasts. */
export const SHELL_REFRESH_EVENT = 'campsite:shell-refresh';

/**
 * Re-run client-side data loaders when the app shell auto-refreshes (periodic tick + tab focus).
 * Use for dashboards that fetch in the browser; this intentionally avoids full
 * `router.refresh()` churn to keep interaction latency low.
 */
export function useShellRefresh(onRefresh: () => void) {
  const cbRef = useRef(onRefresh);
  cbRef.current = onRefresh;
  useEffect(() => {
    const handler = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      void Promise.resolve(cbRef.current());
    };
    window.addEventListener(SHELL_REFRESH_EVENT, handler);
    return () => window.removeEventListener(SHELL_REFRESH_EVENT, handler);
  }, []);
}
