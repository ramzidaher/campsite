import { AdminJobsListClient } from '@/components/admin/AdminJobsListClient';
import { getCachedAdminJobsPageData } from '@/lib/jobs/getCachedAdminJobsPageData';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { createClient } from '@/lib/supabase/server';
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
    const supabase = await createClient();
    const user = await getAuthUser();
    if (!user) redirect('/login');
    const [{ data: orgRes }, { data: panelJobs }] = await Promise.all([
      supabase.from('organisations').select('slug').eq('id', orgId).maybeSingle(),
      supabase
        .from('job_listing_panelists')
        .select(
          'job_listings!inner(id, title, slug, status, grade_level, salary_band, contract_type, published_at, applications_close_at, posted_year, department_id, departments(name))'
        )
        .eq('org_id', orgId)
        .eq('profile_id', user.id)
        .order('created_at', { ascending: false }),
    ]);
    const jobs = (panelJobs ?? [])
      .map(
        (row) =>
          (
            row as {
              job_listings:
                | Parameters<typeof AdminJobsListClient>[0]['rows'][number]
                | Parameters<typeof AdminJobsListClient>[0]['rows'][number][];
            }
          ).job_listings
      )
      .flatMap((rel) => (Array.isArray(rel) ? rel : [rel]))
      .filter(Boolean);
    if (!jobs.length) redirect('/broadcasts');
    const deptMap = new Map<string, string>();
    for (const job of jobs) {
      const dept = Array.isArray(job.departments) ? job.departments[0] : job.departments;
      if (job.department_id && dept?.name) deptMap.set(job.department_id, dept.name);
    }
    return (
      <AdminJobsListClient
        rows={jobs}
        departments={[...deptMap.entries()].map(([id, name]) => ({ id, name }))}
        orgSlug={(orgRes?.slug as string | undefined)?.trim() ?? ''}
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
