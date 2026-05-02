import { cache } from 'react';

import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { resolveWithTimeout } from '@/lib/perf/resolveWithTimeout';
import { createClient } from '@/lib/supabase/server';

const PROFILE_PERSONAL_TAB_QUERY_TIMEOUT_MS = 1400;
const PROFILE_PERSONAL_TAB_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_PROFILE_PERSONAL_TAB_RESPONSE_CACHE_TTL_MS ?? '15000',
  10
);

type HolidayKind = 'bank_holiday' | 'public_holiday' | 'org_break' | 'custom';

export type ProfilePersonalTabData = {
  upcomingHolidayPeriods: Array<{
    id: string;
    name: string;
    holiday_kind: HolidayKind;
    start_date: string;
    end_date: string;
  }>;
  ownRoleLabelsRaw: string[];
  partialSections: string[];
};

const profilePersonalTabResponseCache = new Map<string, TtlCacheEntry<ProfilePersonalTabData>>();
const profilePersonalTabInFlight = new Map<string, Promise<ProfilePersonalTabData>>();
registerSharedCacheStore(
  'campsite:profile:personal-tab',
  profilePersonalTabResponseCache,
  profilePersonalTabInFlight
);

function getProfilePersonalTabCacheKey(orgId: string, userId: string): string {
  return `org:${orgId}:user:${userId}`;
}

export const getCachedProfilePersonalTabData = cache(
  async (
    orgId: string,
    userId: string,
    needsUpcomingData: boolean,
    needsRoleData: boolean
  ): Promise<ProfilePersonalTabData> => {
    return getOrLoadSharedCachedValue({
      cache: profilePersonalTabResponseCache,
      inFlight: profilePersonalTabInFlight,
      key: `${getProfilePersonalTabCacheKey(orgId, userId)}:upcoming:${needsUpcomingData ? '1' : '0'}:roles:${needsRoleData ? '1' : '0'}`,
      cacheNamespace: 'campsite:profile:personal-tab',
      ttlMs: PROFILE_PERSONAL_TAB_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();
        const timeoutFallbackLabels = new Set<string>();
        const resolvePersonalTabWithTimeout = <T,>(
          label: string,
          promise: PromiseLike<T>,
          fallback: unknown
        ): Promise<T> =>
          resolveWithTimeout(promise, PROFILE_PERSONAL_TAB_QUERY_TIMEOUT_MS, fallback as T, () => {
            timeoutFallbackLabels.add(label);
          });

        const upcomingHolidayPeriodsRes = needsUpcomingData
          ? await resolvePersonalTabWithTimeout(
              'org_leave_holiday_periods',
              supabase
                .from('org_leave_holiday_periods')
                .select('id, name, holiday_kind, start_date, end_date')
                .eq('org_id', orgId)
                .eq('is_active', true)
                .gte('end_date', new Date().toISOString().slice(0, 10))
                .order('start_date', { ascending: true })
                .limit(10),
              { data: [], error: null }
            )
          : { data: [], error: null };

        const ownRoleAssignmentsRes = needsRoleData
          ? await resolvePersonalTabWithTimeout(
              'user_org_role_assignments',
              supabase
                .from('user_org_role_assignments')
                .select('role_id')
                .eq('org_id', orgId)
                .eq('user_id', userId),
              { data: [], error: null }
            )
          : { data: [], error: null };

        const ownRoleIds = Array.from(
          new Set(
            ((ownRoleAssignmentsRes.data ?? []) as { role_id: string }[])
              .map((row) => String(row.role_id || '').trim())
              .filter(Boolean)
          )
        );

        const ownRolesRes =
          ownRoleIds.length === 0 || !needsRoleData
            ? { data: [], error: null }
            : await resolvePersonalTabWithTimeout(
                'org_roles',
                supabase
                  .from('org_roles')
                  .select('id, label, key')
                  .eq('org_id', orgId)
                  .eq('is_archived', false)
                  .in('id', ownRoleIds),
                { data: [], error: null }
              );

        return {
          upcomingHolidayPeriods: (upcomingHolidayPeriodsRes.data ?? []) as Array<{
            id: string;
            name: string;
            holiday_kind: HolidayKind;
            start_date: string;
            end_date: string;
          }>,
          ownRoleLabelsRaw: ((ownRolesRes.data ?? []) as { label?: string | null; key?: string | null }[])
            .map((row) => String(row.label || row.key || '').trim())
            .filter(Boolean),
          partialSections: [...timeoutFallbackLabels],
        };
      },
    });
  }
);
