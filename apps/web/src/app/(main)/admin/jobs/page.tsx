import { AdminJobsListClient } from '@/components/admin/AdminJobsListClient';
import { getCachedAdminJobsPageData, getCachedPanelJobsPageData } from '@/lib/jobs/getCachedAdminJobsPageData';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { redirect } from 'next/navigation';

export default async function AdminJobsPage() {
  const pathStartedAtMs = Date.now();
  const bundle = await getCachedMainShellLayoutBundle();
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const permissionKeys = parseShellPermissionKeys(bundle);
  const hasJobsView = permissionKeys.includes('jobs.view');

  if (!hasJobsView) {
    const user = await getAuthUser();
    if (!user) redirect('/login');
    const { orgSlug, jobRows, deptRows } = await withServerPerf(
      '/admin/jobs',
      'jobs_page_bundle_panelist_cached',
      getCachedPanelJobsPageData(orgId, user.id),
      800
    );
    const jobs = jobRows as Parameters<typeof AdminJobsListClient>[0]['rows'];
    if (!jobs.length) redirect('/broadcasts');
    return (
      <AdminJobsListClient
        rows={jobs}
        departments={deptRows as Parameters<typeof AdminJobsListClient>[0]['departments']}
        orgSlug={orgSlug}
      />
    );
  }

  const { orgSlug, jobRows, deptRows } = await withServerPerf(
    '/admin/jobs',
    'jobs_page_bundle_cached',
    getCachedAdminJobsPageData(orgId),
    800
  );

  const view = (
    <AdminJobsListClient
      rows={(jobRows ?? []) as Parameters<typeof AdminJobsListClient>[0]['rows']}
      departments={(deptRows ?? []) as Parameters<typeof AdminJobsListClient>[0]['departments']}
      orgSlug={orgSlug}
    />
  );
  warnIfSlowServerPath('/admin/jobs', pathStartedAtMs);
  return view;
}
