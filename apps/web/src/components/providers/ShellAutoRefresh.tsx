'use client';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

const REFRESH_INTERVAL_MS = 30_000;
const MIN_REFRESH_GAP_MS = 10_000;

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

    const refresh = () => {
      if (!shouldRefreshNow()) return;
      lastRefreshAtRef.current = Date.now();
      void queryClient.invalidateQueries({ refetchType: 'active' });
      router.refresh();
    };

    const onFocus = () => refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    const timer = window.setInterval(refresh, REFRESH_INTERVAL_MS);
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
