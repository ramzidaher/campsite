import { AdminRecruitmentListClient } from '@/components/admin/AdminRecruitmentListClient';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { createClient } from '@/lib/supabase/server';
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
  if (!canViewQueue) redirect('/broadcasts');

  const supabase = await createClient();

  const { data: rows } = await supabase
    .from('recruitment_requests')
    .select(
      'id, job_title, status, urgency, archived_at, created_at, department_id, start_date_needed, advert_release_date, advert_closing_date, shortlisting_dates, interview_schedule, departments(name), submitter:profiles!recruitment_requests_created_by_fkey(full_name)'
    )
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  return <AdminRecruitmentListClient rows={(rows ?? []) as Parameters<typeof AdminRecruitmentListClient>[0]['rows']} />;
}
