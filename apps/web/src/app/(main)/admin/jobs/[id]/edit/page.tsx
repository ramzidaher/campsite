import { AdminJobEditClient } from '@/components/admin/AdminJobEditClient';
import { withServerPerf } from '@/lib/perf/serverPerf';
import { getCachedJobEditPageData } from '@/lib/jobs/getCachedJobEditPageData';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { redirect, notFound } from 'next/navigation';

export default async function AdminJobEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = rawId?.trim();
  if (!id) notFound();

  const bundle = await withServerPerf('/admin/jobs/[id]/edit', 'shell_bundle_for_access', getCachedMainShellLayoutBundle(), 300);
  const orgId = shellBundleOrgId(bundle);
  const permissionKeys = parseShellPermissionKeys(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  if (!permissionKeys.includes('jobs.edit')) redirect('/broadcasts');
  const canHrSettings = permissionKeys.includes('hr.view_records');

  const pageData = await withServerPerf(
    '/admin/jobs/[id]/edit',
    'cached_job_edit_page_data',
    getCachedJobEditPageData(orgId, id, canHrSettings),
    700
  );
  const job = pageData.job as Parameters<typeof AdminJobEditClient>[0]['job'] | null;
  if (!job) notFound();

  const orgSlug = pageData.orgSlug;
  const reqId = job.recruitment_request_id as string;

  return (
    <AdminJobEditClient
      job={job}
      orgSlug={orgSlug}
      requestHref={`/hr/hiring/requests/${reqId}`}
      publicMetrics={pageData.publicMetrics}
      eqCategoryOptions={pageData.eqCategoryOptions}
      applicationFormOptions={pageData.applicationFormOptions}
    />
  );
}
