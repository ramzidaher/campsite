import { cache } from 'react';

import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { createClient } from '@/lib/supabase/server';

export type AdminLeavePageData = {
  members: Array<{ id: string; full_name: string; email: string | null }>;
  settings: Record<string, unknown> | null;
};

const ADMIN_LEAVE_PAGE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_ADMIN_LEAVE_PAGE_RESPONSE_CACHE_TTL_MS ?? '30000',
  10
);
const adminLeavePageResponseCache = new Map<string, TtlCacheEntry<AdminLeavePageData>>();
const adminLeavePageInFlight = new Map<string, Promise<AdminLeavePageData>>();
registerSharedCacheStore('campsite:admin:leave', adminLeavePageResponseCache, adminLeavePageInFlight);

function getAdminLeavePageCacheKey(orgId: string): string {
  return `org:${orgId}`;
}

export const getCachedAdminLeavePageData = cache(async (orgId: string): Promise<AdminLeavePageData> => {
  return getOrLoadSharedCachedValue({
    cache: adminLeavePageResponseCache,
    inFlight: adminLeavePageInFlight,
    key: getAdminLeavePageCacheKey(orgId),
    cacheNamespace: 'campsite:admin:leave',
    ttlMs: ADMIN_LEAVE_PAGE_RESPONSE_CACHE_TTL_MS,
    load: async () => {
      const supabase = await createClient();
      const [membersRes, settingsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, email')
          .eq('org_id', orgId)
          .eq('status', 'active')
          .order('full_name'),
        supabase
          .from('org_leave_settings')
          .select(
            'bradford_window_days, leave_year_start_month, leave_year_start_day, approved_request_change_window_hours, default_annual_entitlement_days, leave_use_working_days, non_working_iso_dows, use_uk_weekly_paid_leave_formula, statutory_weeks_annual_leave, ssp_flat_weekly_rate_gbp, ssp_lel_weekly_gbp, ssp_waiting_qualifying_days, ssp_reform_percent_of_earnings, carry_over_enabled, carry_over_requires_approval, carry_over_max_days, encashment_enabled, encashment_requires_approval, encashment_max_days, leave_accrual_enabled, leave_accrual_frequency, leave_law_country_code, leave_law_profile'
          )
          .eq('org_id', orgId)
          .maybeSingle(),
      ]);
      return {
        members: (membersRes.data ?? []) as Array<{ id: string; full_name: string; email: string | null }>,
        settings: (settingsRes.data as Record<string, unknown> | null) ?? null,
      };
    },
  });
});
