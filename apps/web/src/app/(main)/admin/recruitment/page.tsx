import { AdminRecruitmentListClient } from '@/components/admin/AdminRecruitmentListClient';
import { viewerHasPermission } from '@/lib/authz/serverGuards';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function AdminRecruitmentPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role, status')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  if (!(await viewerHasPermission('recruitment.view'))) redirect('/broadcasts');

  const orgId = profile.org_id as string;

  const { data: rows } = await supabase
    .from('recruitment_requests')
    .select(
      'id, job_title, status, urgency, archived_at, created_at, department_id, departments(name), submitter:profiles!recruitment_requests_created_by_fkey(full_name)'
    )
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  return <AdminRecruitmentListClient rows={(rows ?? []) as Parameters<typeof AdminRecruitmentListClient>[0]['rows']} />;
}
