'use client';

import { SHELL_BADGE_COUNTS_QUERY_KEY } from '@/hooks/useShellBadgeCounts';
import { createClient } from '@/lib/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';

export function ShellBadgeRealtime({
  userId,
  orgId,
}: {
  userId?: string | null;
  orgId?: string | null;
}) {
  const queryClient = useQueryClient();
  const supabase = useMemo(() => createClient(), []);
  const debounceRef = useRef<number | null>(null);
  const lastRefreshAtRef = useRef(0);
  const MIN_REFRESH_INTERVAL_MS = 1200;

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const scheduleRefresh = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        const now = Date.now();
        if (now - lastRefreshAtRef.current < MIN_REFRESH_INTERVAL_MS) return;
        lastRefreshAtRef.current = now;
        void queryClient.invalidateQueries({
          queryKey: SHELL_BADGE_COUNTS_QUERY_KEY,
          refetchType: 'active',
        });
      }, 250);
    };

    const refreshNow = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      const now = Date.now();
      if (now - lastRefreshAtRef.current < MIN_REFRESH_INTERVAL_MS) return;
      lastRefreshAtRef.current = now;
      void queryClient.invalidateQueries({
        queryKey: SHELL_BADGE_COUNTS_QUERY_KEY,
        refetchType: 'active',
      });
    };

    const init = async () => {
      const uid = userId ?? null;
      if (!uid || cancelled) return;

      channel = supabase.channel(`shell-badges-${uid}`);

      // User-scoped notification tables.
      channel
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'broadcast_reads', filter: `user_id=eq.${uid}` },
          scheduleRefresh,
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'recruitment_notifications', filter: `recipient_id=eq.${uid}` },
          scheduleRefresh,
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'application_notifications', filter: `recipient_id=eq.${uid}` },
          scheduleRefresh,
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'leave_notifications', filter: `recipient_id=eq.${uid}` },
          scheduleRefresh,
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'hr_metric_notifications', filter: `recipient_id=eq.${uid}` },
          scheduleRefresh,
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'calendar_event_notifications', filter: `recipient_id=eq.${uid}` },
          scheduleRefresh,
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'performance_reviews', filter: `reviewer_id=eq.${uid}` },
          scheduleRefresh,
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'onboarding_runs', filter: `user_id=eq.${uid}` },
          scheduleRefresh,
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'rota_change_requests', filter: `counterparty_user_id=eq.${uid}` },
          scheduleRefresh,
        );

      // Org-scoped tables used by badge RPC.
      if (orgId) {
        channel
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'broadcasts', filter: `org_id=eq.${orgId}` },
            scheduleRefresh,
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'leave_requests', filter: `org_id=eq.${orgId}` },
            scheduleRefresh,
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'toil_credit_requests', filter: `org_id=eq.${orgId}` },
            scheduleRefresh,
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'recruitment_requests', filter: `org_id=eq.${orgId}` },
            scheduleRefresh,
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'rota_change_requests', filter: `org_id=eq.${orgId}` },
            scheduleRefresh,
          )
          // Do not subscribe to org-wide profile writes: high-churn profile touches
          // (presence, metadata updates) create invalidation storms on hot paths.
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'dept_managers', filter: `user_id=eq.${uid}` },
            scheduleRefresh,
          );
      }

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Initial subscribe and any reconnect should trigger one immediate sync.
          refreshNow();
        }
      });
    };

    void init();

    const onOnline = () => refreshNow();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshNow();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [queryClient, supabase, userId, orgId]);

  return null;
}
