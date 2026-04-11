import { EmployeeHRFileClient } from '@/components/admin/hr/EmployeeHRFileClient';
import { currentLeaveYearKeyUtc } from '@/lib/datetime';
import { createClient } from '@/lib/supabase/server';
import { getDisplayName } from '@/lib/names';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function EmployeeHRFilePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');

  const orgId = profile.org_id as string;

  const [{ data: canViewAll }, { data: canViewTeam }, { data: canManageLeaveOrg }] = await Promise.all([
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'hr.view_records',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'hr.view_direct_reports',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'leave.manage_org',
      p_context: {},
    }),
  ]);
  if (!canViewAll && !canViewTeam) redirect('/hr/records');

  const canManage = await supabase
    .rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'hr.manage_records',
      p_context: {},
    })
    .then(({ data }) => !!data);

  const { data: leaveSettingsForYear } = await supabase
    .from('org_leave_settings')
    .select('leave_year_start_month, leave_year_start_day')
    .eq('org_id', orgId)
    .maybeSingle();

  const hrFileLeaveYearKey = currentLeaveYearKeyUtc(
    new Date(),
    Number(leaveSettingsForYear?.leave_year_start_month ?? 1),
    Number(leaveSettingsForYear?.leave_year_start_day ?? 1),
  );

  const [{ data: fileRows }, { data: leaveData }, { data: sickScore }] = await Promise.all([
    supabase.rpc('hr_employee_file', { p_user_id: userId }),
    supabase
      .from('leave_allowances')
      .select('leave_year, annual_entitlement_days, toil_balance_days')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .eq('leave_year', hrFileLeaveYearKey)
      .maybeSingle(),
    // Bradford score
    supabase.rpc('bradford_factor_for_user', {
      p_user_id: userId,
      p_on: new Date().toISOString().slice(0, 10),
    }),
  ]);

  const fileRow = (fileRows ?? [])[0] ?? null;
  if (!fileRow) redirect('/hr/records');

  const canMarkProbationCheck =
    canManage ||
    (!!canViewTeam && (fileRow.reports_to_user_id as string | null) === user.id);

  const hrRecordId = fileRow.hr_record_id as string | null;
  const { data: auditRows } = hrRecordId
    ? await supabase
        .from('employee_hr_record_events')
        .select('id, field_name, old_value, new_value, created_at, changed_by')
        .eq('org_id', orgId)
        .eq('record_id', hrRecordId)
        .order('created_at', { ascending: false })
        .limit(50)
    : { data: [] };

  // get names for audit events
  const changerIds = [...new Set((auditRows ?? []).map((e) => e.changed_by as string))];
  const changerNames: Record<string, string> = {};
  if (changerIds.length) {
    const { data: changers } = await supabase.from('profiles').select('id, full_name, preferred_name').in('id', changerIds);
    for (const c of changers ?? []) {
      changerNames[c.id as string] = getDisplayName(c.full_name as string, (c.preferred_name as string | null) ?? null);
    }
  }

  // applications list for "hired from" dropdown
  const { data: applications } = await supabase
    .from('job_applications')
    .select('id, candidate_name, job_listing_id')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(200);

  const b0 = Array.isArray(sickScore) ? sickScore[0] : sickScore;
  const absenceScore =
    b0 && typeof b0 === 'object' && 'bradford_score' in b0
      ? {
          spell_count: Number((b0 as { spell_count: number }).spell_count),
          total_days: Number((b0 as { total_days: number }).total_days),
          bradford_score: Number((b0 as { bradford_score: number }).bradford_score),
        }
      : null;

  return (
    <EmployeeHRFileClient
      orgId={orgId}
      canManage={canManage}
      canMarkProbationCheck={canMarkProbationCheck}
      canViewGrading={!!canViewAll || !!canManageLeaveOrg}
      employee={fileRow as Parameters<typeof EmployeeHRFileClient>[0]['employee']}
      auditEvents={(auditRows ?? []).map((e) => ({
        id: e.id as string,
        field_name: e.field_name as string,
        old_value: (e.old_value as string | null) ?? null,
        new_value: (e.new_value as string | null) ?? null,
        created_at: e.created_at as string,
        changer_name: changerNames[e.changed_by as string] ?? 'Unknown',
      }))}
      leaveAllowance={
        leaveData
          ? {
              annual_entitlement_days: Number(leaveData.annual_entitlement_days ?? 0),
              toil_balance_days: Number(leaveData.toil_balance_days ?? 0),
            }
          : null
      }
      leaveEntitlementYearLabel={hrFileLeaveYearKey}
      absenceScore={absenceScore}
      showAbsenceReportingLink={!!canViewAll || !!canViewTeam || !!canManageLeaveOrg}
      applications={(applications ?? []) as { id: string; candidate_name: string; job_listing_id: string }[]}
    />
  );
}
