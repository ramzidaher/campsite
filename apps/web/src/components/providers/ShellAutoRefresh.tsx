'use client';

import { SHELL_REFRESH_EVENT } from '@/hooks/useShellRefresh';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

// Interval for React Query invalidation + SHELL_REFRESH_EVENT (keeps client-side
// lists fresh). router.refresh() is intentionally NOT called on the interval —
// badge counts are now managed by useShellBadgeCounts (polls every 60 s), so a
// 3-second server re-render per user would generate ~10 000 DB calls/second at
// scale. router.refresh() still fires on focus/visibility change for structural
// layout data (org name, nav permissions).
const REFRESH_INTERVAL_MS = 3_000;
const MIN_REFRESH_GAP_MS  = 2_500;

export function ShellAutoRefresh() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const lastRefreshAtRef = useRef(0);

  useEffect(() => {
    let stopped = false;

    const shouldRefreshNow = () => {
      if (stopped) return false;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return false;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
      return Date.now() - lastRefreshAtRef.current >= MIN_REFRESH_GAP_MS;
    };

    const refresh = (includeRouterRefresh = false) => {
      if (!shouldRefreshNow()) return;
      lastRefreshAtRef.current = Date.now();
      void queryClient.invalidateQueries({ refetchType: 'active' });
      window.dispatchEvent(new Event(SHELL_REFRESH_EVENT));
      // Only do a full server re-render when the user returns to the tab —
      // not on the 3-second background interval.
      if (includeRouterRefresh) router.refresh();
    };

    const onFocus = () => refresh(true);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh(true);
    };

    const timer = window.setInterval(() => refresh(false), REFRESH_INTERVAL_MS);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [router, queryClient]);

  return null;
}
