import { AdminJobsListClient } from '@/components/admin/AdminJobsListClient';
import { getCachedAdminJobsPageData } from '@/lib/jobs/getCachedAdminJobsPageData';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { redirect } from 'next/navigation';

export default async function AdminJobsPage() {
  const pathStartedAtMs = Date.now();
  const bundle = await getCachedMainShellLayoutBundle();
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const permissionKeys = parseShellPermissionKeys(bundle);
  if (!permissionKeys.includes('jobs.view')) redirect('/broadcasts');

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
