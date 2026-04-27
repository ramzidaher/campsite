import { AdminRecruitmentListClient } from '@/components/admin/AdminRecruitmentListClient';
import { ManagerRecruitmentClient } from '@/components/manager/ManagerRecruitmentClient';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function HrRecruitmentPage() {
  const bundle = await getCachedMainShellLayoutBundle();
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const permissionKeys = parseShellPermissionKeys(bundle);
  const canCreateRequest    = permissionKeys.includes('recruitment.create_request');
  const canViewRecruitment  = permissionKeys.includes('recruitment.view');
  const canApproveRequest   = permissionKeys.includes('recruitment.approve_request');
  const canManageRecruitment = permissionKeys.includes('recruitment.manage');

  const canRaise = Boolean(canCreateRequest);
  const canUseRecruitmentWorkspace =
    canRaise || canViewRecruitment || canApproveRequest || canManageRecruitment;
  if (!canUseRecruitmentWorkspace) redirect('/broadcasts');

  const canViewQueue = Boolean(canViewRecruitment || canApproveRequest || canManageRecruitment);
  if (canViewQueue) {
    const { data: rows } = await supabase
      .from('recruitment_requests')
      .select(
        'id, job_title, status, urgency, archived_at, created_at, department_id, start_date_needed, advert_release_date, advert_closing_date, shortlisting_dates, interview_schedule, departments(name), submitter:profiles!recruitment_requests_created_by_fkey(full_name)'
      )
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    return <AdminRecruitmentListClient rows={(rows ?? []) as Parameters<typeof AdminRecruitmentListClient>[0]['rows']} />;
  }

  const [{ data: ownDeptRows }, { data: dmRows }, { data: directReportRows }] = await Promise.all([
    supabase.from('user_departments').select('dept_id').eq('user_id', user.id),
    supabase.from('dept_managers').select('dept_id').eq('user_id', user.id),
    supabase.from('profiles').select('id').eq('org_id', orgId).eq('reports_to_user_id', user.id),
  ]);

  const directReportIds = (directReportRows ?? []).map((r) => String(r.id));
  const [{ data: directReportDeptRows }, { data: directReportManagerRows }, { data: indirectReportRows }] =
    directReportIds.length
      ? await Promise.all([
          supabase.from('user_departments').select('dept_id').in('user_id', directReportIds),
          supabase.from('dept_managers').select('user_id').in('user_id', directReportIds).limit(1),
          supabase
            .from('profiles')
            .select('id')
            .eq('org_id', orgId)
            .in('reports_to_user_id', directReportIds)
            .limit(1),
        ])
      : [
          { data: [] as { dept_id: string | null }[] },
          { data: [] as { user_id: string }[] },
          { data: [] as { id: string }[] },
        ];

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
      .eq('org_id', orgId)
      .in('id', allowedDeptIds)
      .order('name', { ascending: true });
    managedDepartments = (deptRows ?? [])
      .filter((d) => !d.is_archived)
      .map((d) => ({ id: String(d.id), name: String(d.name ?? 'Department') }));
  }

  const isHierarchyLeader = Boolean((directReportManagerRows ?? []).length || (indirectReportRows ?? []).length);
  if (canRaise && (canApproveRequest || canManageRecruitment || isHierarchyLeader)) {
    const { data: allDeptRows } = await supabase
      .from('departments')
      .select('id, name, is_archived')
      .eq('org_id', orgId)
      .order('name', { ascending: true });
    managedDepartments = (allDeptRows ?? [])
      .filter((d) => !d.is_archived)
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
      showHrAdminLink={Boolean(canApproveRequest || canManageRecruitment)}
    />
  );
}
