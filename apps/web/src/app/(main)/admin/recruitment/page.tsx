import { AdminRecruitmentListClient } from '@/components/admin/AdminRecruitmentListClient';
import { getCachedRecruitmentQueuePageData } from '@/lib/recruitment/getCachedRecruitmentQueuePageData';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { withServerPerf } from '@/lib/perf/serverPerf';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { redirect } from 'next/navigation';

export default async function AdminRecruitmentPage() {
  const bundle = await getCachedMainShellLayoutBundle();
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const permissionKeys = parseShellPermissionKeys(bundle);
  const canViewQueue = permissionKeys.some((key) =>
    ['recruitment.view', 'recruitment.manage', 'recruitment.approve_request'].includes(key)
  );
  if (!canViewQueue) redirect('/forbidden');

  const rows = await withServerPerf(
    '/admin/recruitment',
    'recruitment_queue_bundle_cached',
    getCachedRecruitmentQueuePageData(orgId),
    700
  );

  return <AdminRecruitmentListClient rows={(rows ?? []) as Parameters<typeof AdminRecruitmentListClient>[0]['rows']} />;
}
