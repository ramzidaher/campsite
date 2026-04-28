import { LeaveHubClient } from '@/components/leave/LeaveHubClient';
import { currentLeaveYearKeyForOrgCalendar, currentLeaveYearKeyUtc } from '@/lib/datetime';
import {
  parseShellPermissionKeys,
  shellBundleOrgId,
  shellBundleProfileStatus,
} from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function LeavePage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');
  const bundle = await getCachedMainShellLayoutBundle();
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const keys = parseShellPermissionKeys(bundle);

  const canView =
    keys.includes('leave.view_own') ||
    keys.includes('leave.approve_direct_reports') ||
    keys.includes('leave.manage_org');
  if (!canView) redirect('/broadcasts');

  const canSubmit = keys.includes('leave.submit');
  const canApprove = keys.includes('leave.approve_direct_reports') || keys.includes('leave.manage_org');
  const canManage = keys.includes('leave.manage_org');

  const supabase = await createClient();
  const [{ data: leaveSettings }, { data: orgRow }, { data: holidayPeriods }] = await Promise.all([
    supabase
      .from('org_leave_settings')
      .select(
        'leave_year_start_month, leave_year_start_day, approved_request_change_window_hours, leave_use_working_days, non_working_iso_dows, toil_minutes_per_day',
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
    ? (leaveSettings.non_working_iso_dows as number[]).map((n) => Number(n))
    : [6, 7];
  // Normalize legacy JS weekday values (Sun=0) to ISO weekday values (Sun=7).
  const nonWorkingIsoDows = [...new Set(nonWorkingIsoDowsRaw.map((n) => (n === 0 ? 7 : n)).filter((n) => n >= 1 && n <= 7))];
  const toilMinutesPerDay = Math.max(1, Number(leaveSettings?.toil_minutes_per_day ?? 480));

  return (
    <LeaveHubClient
      orgId={orgId}
      userId={user.id}
      canSubmit={canSubmit}
      canApprove={canApprove}
      canManage={canManage}
      initialYear={initialYear}
      orgTimezone={orgTimezone}
      leaveYearStartMonth={leaveYearStartMonth}
      leaveYearStartDay={leaveYearStartDay}
      approvedChangeWindowHours={approvedChangeWindowHours}
      leaveUseWorkingDays={leaveUseWorkingDays}
      nonWorkingIsoDows={nonWorkingIsoDows}
      toilMinutesPerDay={toilMinutesPerDay}
      initialHolidayPeriods={
        (holidayPeriods ?? []) as Array<{
          id: string;
          name: string;
          holiday_kind: string;
          start_date: string;
          end_date: string;
          is_active: boolean;
        }>
      }
    />
  );
}
