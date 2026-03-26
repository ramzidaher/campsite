'use client';

import { createClient } from '@/lib/supabase/client';
import { flushBroadcastReadQueue } from '@/lib/offline/broadcastReadQueue';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

/** Flushes queued broadcast reads when connectivity returns; invalidates feed cache after sync. */
export function OfflineReadQueueSync() {
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();

  useEffect(() => {
    const run = () => {
      void (async () => {
        const n = await flushBroadcastReadQueue(supabase);
        if (n > 0) {
          await queryClient.invalidateQueries({
            predicate: (q) =>
              Array.isArray(q.queryKey) &&
              (q.queryKey[0] === 'broadcast-feed' || q.queryKey[0] === 'broadcast-feed-search'),
          });
        }
      })();
    };

    run();
    window.addEventListener('online', run);
    return () => window.removeEventListener('online', run);
  }, [supabase, queryClient]);

  return null;
}
