import { InterviewScheduleClient } from '@/app/(main)/admin/interviews/InterviewScheduleClient';
import { getCachedInterviewSchedulePageData } from '@/lib/interviews/getCachedInterviewSchedulePageData';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { withServerPerf } from '@/lib/perf/serverPerf';
import { redirect } from 'next/navigation';

export default async function AdminInterviewsPage() {
  const bundle = await getCachedMainShellLayoutBundle();
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const permissionKeys = parseShellPermissionKeys(bundle);
  const canViewInterviews = permissionKeys.includes('interviews.view');
  const canBookInterviewSlot = permissionKeys.includes('interviews.book_slot');
  if (!canViewInterviews && !canBookInterviewSlot) redirect('/broadcasts');
  const canCreateSlot = permissionKeys.includes('interviews.create_slot');
  const canCompleteSlot = permissionKeys.includes('interviews.complete_slot');
  const { jobs, profiles, slots } = await withServerPerf(
    '/admin/interviews',
    'interview_schedule_bundle_cached',
    getCachedInterviewSchedulePageData(orgId),
    700
  );

  return (
    <InterviewScheduleClient
      canCreateSlot={canCreateSlot}
      canCompleteSlot={canCompleteSlot}
      jobs={jobs}
      profiles={profiles}
      initialSlots={slots as Parameters<typeof InterviewScheduleClient>[0]['initialSlots']}
    />
  );
}
