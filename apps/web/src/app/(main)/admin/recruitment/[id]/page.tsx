import { AdminRecruitmentDetailClient } from '@/components/admin/AdminRecruitmentDetailClient';
import { withServerPerf } from '@/lib/perf/serverPerf';
import { getCachedRecruitmentRequestDetailPageData } from '@/lib/recruitment/getCachedRecruitmentRequestDetailPageData';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { redirect } from 'next/navigation';

export default async function AdminRecruitmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = rawId?.trim();
  if (!id) redirect('/hr/hiring/requests');

  const bundle = await getCachedMainShellLayoutBundle();
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const permissionKeys = parseShellPermissionKeys(bundle);
  const canViewQueue = permissionKeys.some((key) =>
    ['recruitment.view', 'recruitment.manage', 'recruitment.approve_request'].includes(key)
  );
  if (!canViewQueue) redirect('/forbidden');

  const { request, events, jobListing, orgSlug } = await withServerPerf(
    '/admin/recruitment/[id]',
    'recruitment_request_detail_bundle_cached',
    getCachedRecruitmentRequestDetailPageData(orgId, id),
    700
  );

  if (!request) redirect('/hr/hiring/requests');

  return (
    <AdminRecruitmentDetailClient
      request={request as Parameters<typeof AdminRecruitmentDetailClient>[0]['request']}
      events={events}
      jobListing={
        jobListing
          ? {
              id: jobListing.id as string,
              status: jobListing.status as string,
              slug: jobListing.slug as string,
            }
          : null
      }
      orgSlug={orgSlug}
    />
  );
}
