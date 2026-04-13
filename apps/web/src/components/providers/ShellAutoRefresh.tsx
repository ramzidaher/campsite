'use client';

import { SHELL_REFRESH_EVENT } from '@/hooks/useShellRefresh';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

// Interval for targeted React Query invalidation + SHELL_REFRESH_EVENT (keeps
// client-side lists reasonably fresh). router.refresh() is NOT called on this
// timer — only on tab focus / visibility (see refresh(true)).
//
// IMPORTANT: Do not call invalidateQueries() without a predicate — that refetches
// *every* active query (including shell-badge-counts), which would hit
// main_shell_badge_counts_bundle ~20×/min per tab and overload Postgres.
//
// Badge counts: useShellBadgeCounts (60 s) + window focus. Broadcast feed:
// invalidated here on a slower cadence only.
const REFRESH_INTERVAL_MS = 30_000;
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
      void queryClient.invalidateQueries({
        refetchType: 'active',
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          (q.queryKey[0] === 'broadcast-feed' || q.queryKey[0] === 'broadcast-feed-search'),
      });
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
