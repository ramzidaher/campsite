import { ManagerRecruitmentClient } from '@/components/manager/ManagerRecruitmentClient';
import { createClient } from '@/lib/supabase/server';
import { isDepartmentWorkspaceRole, isManagerRole, isOrgAdminRole } from '@campsite/types';
import { redirect } from 'next/navigation';

export default async function ManagerRecruitmentPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, org_id, role, status')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id || profile.status !== 'active' || !isDepartmentWorkspaceRole(profile.role)) {
    redirect('/broadcasts');
  }

  const canRaise = isManagerRole(profile.role);

  const { data: dmRows } = await supabase
    .from('dept_managers')
    .select('dept_id, departments(id, name)')
    .eq('user_id', user.id);

  const managedDepartments =
    (dmRows ?? [])
      .map((row) => {
        const dept = row.departments as { id: string; name: string } | { id: string; name: string }[] | null;
        const d = Array.isArray(dept) ? dept[0] : dept;
        if (!d?.id) return null;
        return { id: d.id, name: String(d.name ?? 'Department') };
      })
      .filter((x): x is { id: string; name: string } => x !== null) ?? [];

  let initialRequests: Parameters<typeof ManagerRecruitmentClient>[0]['initialRequests'] = [];
  if (canRaise) {
    const { data: reqRows } = await supabase
      .from('recruitment_requests')
      .select('id, job_title, status, urgency, archived_at, created_at, department_id, departments(name)')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false });
    initialRequests = (reqRows ?? []) as typeof initialRequests;
  }

  return (
    <ManagerRecruitmentClient
      managedDepartments={managedDepartments}
      initialRequests={initialRequests}
      canRaise={canRaise}
      showHrAdminLink={isOrgAdminRole(profile.role)}
    />
  );
}
