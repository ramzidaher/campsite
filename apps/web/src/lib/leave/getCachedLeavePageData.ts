import { cache } from 'react';

import { currentLeaveYearKeyForOrgCalendar, currentLeaveYearKeyUtc } from '@/lib/datetime';
import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { createClient } from '@/lib/supabase/server';

export type LeavePageData = {
  orgTimezone: string | null;
  leaveYearStartMonth: number;
  leaveYearStartDay: number;
  approvedChangeWindowHours: number;
  initialYear: string;
  leaveUseWorkingDays: boolean;
  nonWorkingIsoDows: number[];
  toilMinutesPerDay: number;
  initialHolidayPeriods: Array<{
    id: string;
    name: string;
    holiday_kind: string;
    start_date: string;
    end_date: string;
    is_active: boolean;
  }>;
};

const LEAVE_PAGE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_LEAVE_PAGE_RESPONSE_CACHE_TTL_MS ?? '30000',
  10
);
const leavePageResponseCache = new Map<string, TtlCacheEntry<LeavePageData>>();
const leavePageInFlight = new Map<string, Promise<LeavePageData>>();
registerSharedCacheStore('campsite:leave:page', leavePageResponseCache, leavePageInFlight);

function getLeavePageCacheKey(orgId: string): string {
  return `org:${orgId}`;
}

export const getCachedLeavePageData = cache(async (orgId: string): Promise<LeavePageData> => {
  return getOrLoadSharedCachedValue({
    cache: leavePageResponseCache,
    inFlight: leavePageInFlight,
    key: getLeavePageCacheKey(orgId),
    cacheNamespace: 'campsite:leave:page',
    ttlMs: LEAVE_PAGE_RESPONSE_CACHE_TTL_MS,
    load: async () => {
      const supabase = await createClient();
      const [{ data: leaveSettings }, { data: orgRow }, { data: holidayPeriods }] = await Promise.all([
        supabase
          .from('org_leave_settings')
          .select(
            'leave_year_start_month, leave_year_start_day, approved_request_change_window_hours, leave_use_working_days, non_working_iso_dows, toil_minutes_per_day'
          )
          .eq('org_id', orgId)
          .maybeSingle(),
        supabase.from('organisations').select('timezone').eq('id', orgId).maybeSingle(),
        supabase
          .from('org_leave_holiday_periods')
          .select('id, name, holiday_kind, start_date, end_date, is_active')
          .eq('org_id', orgId)
          .eq('is_active', true)
          .order('start_date', { ascending: true }),
      ]);

      const orgTimezone = (orgRow?.timezone as string | null) ?? null;
      const leaveYearStartMonth = Number(leaveSettings?.leave_year_start_month ?? 1);
      const leaveYearStartDay = Number(leaveSettings?.leave_year_start_day ?? 1);
      const approvedChangeWindowHours = Number(leaveSettings?.approved_request_change_window_hours ?? 48);
      const initialYear = orgTimezone
        ? currentLeaveYearKeyForOrgCalendar(new Date(), orgTimezone, leaveYearStartMonth, leaveYearStartDay)
        : currentLeaveYearKeyUtc(new Date(), leaveYearStartMonth, leaveYearStartDay);
      const leaveUseWorkingDays = Boolean(leaveSettings?.leave_use_working_days);
      const nonWorkingIsoDowsRaw = Array.isArray(leaveSettings?.non_working_iso_dows)
        ? (leaveSettings.non_working_iso_dows as number[]).map((value) => Number(value))
        : [6, 7];
      const nonWorkingIsoDows = [
        ...new Set(nonWorkingIsoDowsRaw.map((value) => (value === 0 ? 7 : value)).filter((value) => value >= 1 && value <= 7)),
      ];
      const toilMinutesPerDay = Math.max(1, Number(leaveSettings?.toil_minutes_per_day ?? 480));

      return {
        orgTimezone,
        leaveYearStartMonth,
        leaveYearStartDay,
        approvedChangeWindowHours,
        initialYear,
        leaveUseWorkingDays,
        nonWorkingIsoDows,
        toilMinutesPerDay,
        initialHolidayPeriods: (holidayPeriods ?? []) as Array<{
          id: string;
          name: string;
          holiday_kind: string;
          start_date: string;
          end_date: string;
          is_active: boolean;
        }>,
      };
    },
  });
});
