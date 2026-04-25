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
 * - Realtime invalidation is handled by `ShellBadgeRealtime`
 * - Server `initialData` avoids an immediate duplicate refetch after hydration when fresh
 */
export function useShellBadgeCounts(initialData?: ShellBadgeCounts) {
  return useQuery<ShellBadgeCounts>({
    queryKey: SHELL_BADGE_COUNTS_QUERY_KEY,
    queryFn: async () => {
      const supabase = createClient();
      const timeoutMs = 1200;
      const rpcPromise = supabase.rpc('main_shell_badge_counts_bundle');
      const timeoutPromise = new Promise<{ data: unknown }>((resolve) =>
        setTimeout(() => resolve({ data: initialData ?? {} }), timeoutMs)
      );
      const resolved = await Promise.race([rpcPromise, timeoutPromise]);
      return parseShellBadgeCounts(resolved?.data ?? initialData ?? {});
    },
    initialData,
    initialDataUpdatedAt: initialData ? Date.now() : undefined,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}
