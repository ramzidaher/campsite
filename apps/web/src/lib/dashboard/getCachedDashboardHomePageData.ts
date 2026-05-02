import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import { loadDashboardHomeGuarded } from '@/lib/dashboard/loadDashboardHome';
import { createClient } from '@/lib/supabase/server';

type DashboardProfileInput = {
  full_name: string | null;
  role: string;
};

type DashboardLoadOptions = {
  initialBroadcastUnread?: number;
  initialPendingApprovals?: number;
  manualRefresh?: boolean;
};

export const getCachedDashboardHomePageData = cache(async (
  userId: string,
  orgId: string,
  fullName: string | null,
  role: string,
  initialBroadcastUnread: number | undefined,
  initialPendingApprovals: number | undefined,
  manualRefresh: boolean
) => {
  const supabase: SupabaseClient = await createClient();
  const profile: DashboardProfileInput = { full_name: fullName, role };
  const options: DashboardLoadOptions = {
    initialBroadcastUnread,
    initialPendingApprovals,
    manualRefresh,
  };
  return loadDashboardHomeGuarded(supabase, userId, orgId, profile, options);
});
