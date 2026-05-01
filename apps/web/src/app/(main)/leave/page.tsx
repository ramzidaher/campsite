import { LeaveHubClient } from '@/components/leave/LeaveHubClient';
import { getCachedLeavePageData } from '@/lib/leave/getCachedLeavePageData';
import {
  parseShellPermissionKeys,
  shellBundleOrgId,
  shellBundleProfileStatus,
} from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { redirect } from 'next/navigation';

export default async function LeavePage() {
  const bundle = await getCachedMainShellLayoutBundle();
  const userIdRaw = (bundle as Record<string, unknown>)['user_id'];
  const userId = typeof userIdRaw === 'string' ? userIdRaw : '';
  if (!userId) redirect('/login');
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

  const pageData = await getCachedLeavePageData(orgId);

  return (
    <LeaveHubClient
      orgId={orgId}
      userId={userId}
      canSubmit={canSubmit}
      canApprove={canApprove}
      canManage={canManage}
      initialYear={pageData.initialYear}
      orgTimezone={pageData.orgTimezone}
      leaveYearStartMonth={pageData.leaveYearStartMonth}
      leaveYearStartDay={pageData.leaveYearStartDay}
      approvedChangeWindowHours={pageData.approvedChangeWindowHours}
      leaveUseWorkingDays={pageData.leaveUseWorkingDays}
      nonWorkingIsoDows={pageData.nonWorkingIsoDows}
      toilMinutesPerDay={pageData.toilMinutesPerDay}
      initialHolidayPeriods={pageData.initialHolidayPeriods}
    />
  );
}
