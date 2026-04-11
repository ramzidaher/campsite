'use client';

import { useEffect, useRef } from 'react';

/** Dispatched by `ShellAutoRefresh` on each global refresh tick (when tab is visible). */
export const SHELL_REFRESH_EVENT = 'campsite:shell-refresh';

/**
 * Re-run client-side data loaders when the app shell auto-refreshes (same cadence as `router.refresh()`).
 * Use for dashboards that fetch in the browser; server-rendered props update from `router.refresh()` alone.
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
