'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import {
  type ShellBadgeCounts,
  parseShellBadgeCounts,
} from '@/lib/shell/shellBadgeCounts';

export type { ShellBadgeCounts };

/** Shared with BroadcastFeed so unread refresh refetches this instead of `broadcast_unread_count`. */
export const SHELL_BADGE_COUNTS_QUERY_KEY = ['shell-badge-counts'] as const;

/**
 * Fetches shell badge counts client-side via React Query.
 *
 * - Polls on an interval only while the tab is visible
 * - Server `initialData` avoids an immediate duplicate refetch after hydration when fresh
 */
export function useShellBadgeCounts(initialData?: ShellBadgeCounts) {
  return useQuery<ShellBadgeCounts>({
    queryKey: SHELL_BADGE_COUNTS_QUERY_KEY,
    queryFn: async () => {
      const supabase = createClient();
      const { data } = await supabase.rpc('main_shell_badge_counts_bundle');
      return parseShellBadgeCounts(data);
    },
    initialData,
    initialDataUpdatedAt: initialData ? Date.now() : undefined,
    staleTime: 60_000,
    refetchInterval: () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return false;
      }
      return 90_000;
    },
    refetchOnWindowFocus: true,
  });
}
