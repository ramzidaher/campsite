import { AdminJobAdminLegalClient } from '@/components/admin/AdminJobAdminLegalClient';
import { viewerHasPermission } from '@/lib/authz/serverGuards';
import { getCachedJobAdminLegalPageData } from '@/lib/jobs/getCachedJobAdminLegalPageData';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { notFound, redirect } from 'next/navigation';

export default async function AdminJobAdminLegalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = rawId?.trim();
  if (!id) notFound();

  const bundle = await getCachedMainShellLayoutBundle();
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const permissionKeys = parseShellPermissionKeys(bundle);
  if (!permissionKeys.includes('jobs.edit')) redirect('/forbidden');
  if (!(await viewerHasPermission('jobs.edit'))) redirect('/forbidden');

  const pageData = await getCachedJobAdminLegalPageData(orgId, id);
  if (!pageData.job) notFound();
  const job = pageData.job;

  return (
    <AdminJobAdminLegalClient
      jobId={job.id}
      jobTitle={job.title}
      successEmailBodyInitial={String(job.success_email_body ?? '')}
      rejectionEmailBodyInitial={String(job.rejection_email_body ?? '')}
      interviewInviteEmailBodyInitial={String(job.interview_invite_email_body ?? '')}
      offerTemplateIdInitial={String(job.offer_template_id ?? '')}
      contractTemplateIdInitial={String(job.contract_template_id ?? '')}
      offerTemplateOptions={pageData.offerTemplateOptions}
      contractTemplateOptions={pageData.contractTemplateOptions}
    />
  );
}
