import { ManagerRecruitmentClient } from '@/components/manager/ManagerRecruitmentClient';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function ManagerRecruitmentPage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, org_id, status')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id || profile.status !== 'active') {
    redirect('/broadcasts');
  }
  const [
    { data: canCreateRequest },
    { data: canViewRecruitment },
    { data: canApproveRequest },
    { data: canManageRecruitment },
  ] = await Promise.all([
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: profile.org_id,
      p_permission_key: 'recruitment.create_request',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: profile.org_id,
      p_permission_key: 'recruitment.view',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: profile.org_id,
      p_permission_key: 'recruitment.approve_request',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: profile.org_id,
      p_permission_key: 'recruitment.manage',
      p_context: {},
    }),
  ]);
  const canRaise = Boolean(canCreateRequest);
  const canUseRecruitmentWorkspace =
    canRaise || canViewRecruitment || canApproveRequest || canManageRecruitment;
  if (!canUseRecruitmentWorkspace) redirect('/broadcasts');

  const [{ data: ownDeptRows }, { data: dmRows }, { data: directReportRows }] = await Promise.all([
    supabase.from('user_departments').select('dept_id').eq('user_id', user.id),
    supabase.from('dept_managers').select('dept_id').eq('user_id', user.id),
    supabase.from('profiles').select('id').eq('org_id', profile.org_id).eq('reports_to_user_id', user.id),
  ]);

  const directReportIds = (directReportRows ?? []).map((r) => String(r.id));
  const { data: directReportDeptRows } = directReportIds.length
    ? await supabase.from('user_departments').select('dept_id').in('user_id', directReportIds)
    : { data: [] as { dept_id: string | null }[] };

  const allowedDeptIds = Array.from(
    new Set([
      ...(ownDeptRows ?? []).map((row) => String(row.dept_id)),
      ...(dmRows ?? []).map((row) => String(row.dept_id)),
      ...(directReportDeptRows ?? []).map((row) => String(row.dept_id)),
    ].filter((v) => v && v !== 'null'))
  );

  let managedDepartments: Array<{ id: string; name: string }> = [];
  if (allowedDeptIds.length) {
    const { data: deptRows } = await supabase
      .from('departments')
      .select('id, name, is_archived')
      .eq('org_id', profile.org_id)
      .in('id', allowedDeptIds)
      .order('name', { ascending: true });
    managedDepartments = (deptRows ?? [])
      .filter((d) => !Boolean(d.is_archived))
      .map((d) => ({ id: String(d.id), name: String(d.name ?? 'Department') }));
  }

  // Org admins / HR approvers can raise recruitment requests even if they are
  // not explicitly assigned as department managers. Offer all active departments.
  if (canRaise && managedDepartments.length === 0 && canApproveRequest) {
    const { data: allDeptRows } = await supabase
      .from('departments')
      .select('id, name, is_archived')
      .eq('org_id', profile.org_id)
      .order('name', { ascending: true });
    managedDepartments = (allDeptRows ?? [])
      .filter((d) => !Boolean(d.is_archived))
      .map((d) => ({ id: String(d.id), name: String(d.name ?? 'Department') }));
  }

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
      showHrAdminLink={Boolean(canApproveRequest)}
    />
  );
}
