'use server';

import { sendRecruitmentRequestHrEmail } from '@/lib/recruitment/sendRecruitmentRequestHrEmail';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import {
  isRecruitmentContractType,
  isRecruitmentHireReason,
  isRecruitmentUrgency,
} from '@campsite/types';
import { revalidatePath } from 'next/cache';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export type CreateRecruitmentRequestState = { ok: true; id: string } | { ok: false; error: string };

export async function createRecruitmentRequest(form: {
  departmentId: string;
  jobTitle: string;
  gradeLevel: string;
  salaryBand: string;
  businessCase: string;
  headcountType: string;
  costCenter: string;
  budgetApproved: boolean;
  targetStartWindow: string;
  hiringOwnerUserId?: string;
  reasonForHire: string;
  startDateNeeded: string;
  contractType: string;
  idealCandidateProfile: string;
  specificRequirements: string;
  urgency: string;
}): Promise<CreateRecruitmentRequestState> {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, org_id, role, status, full_name')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.org_id || profile.status !== 'active') {
    return { ok: false, error: 'Account not active or missing organisation.' };
  }
  const { data: canCreateRequest } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: profile.org_id,
    p_permission_key: 'recruitment.create_request',
    p_context: {},
  });
  if (!canCreateRequest) {
    return { ok: false, error: 'You do not have permission to raise recruitment requests.' };
  }

  const deptId = form.departmentId?.trim();
  if (!deptId) return { ok: false, error: 'Choose a department.' };

  const [{ data: canApproveRequest }, { data: canManageRecruitment }] = await Promise.all([
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
  const canCreateForAnyDepartment = Boolean(canApproveRequest || canManageRecruitment);

  const { data: deptScope } = await supabase
    .from('departments')
    .select('id')
    .eq('id', deptId)
    .eq('org_id', profile.org_id)
    .eq('is_archived', false)
    .maybeSingle();
  if (!deptScope) return { ok: false, error: 'Department not found in your organisation.' };

  const [{ data: ownDeptMatch }, { data: dmMatch }, { data: directReportRows }] = await Promise.all([
    supabase.from('user_departments').select('dept_id').eq('user_id', user.id).eq('dept_id', deptId).maybeSingle(),
    supabase.from('dept_managers').select('dept_id').eq('user_id', user.id).eq('dept_id', deptId).maybeSingle(),
    supabase.from('profiles').select('id').eq('org_id', profile.org_id).eq('reports_to_user_id', user.id),
  ]);

  let canRaiseForDirectReportDepartment = false;
  const directReportIds = (directReportRows ?? []).map((r) => String(r.id));
  let canCreateForAnyDepartmentByHierarchy = false;
  if (directReportIds.length > 0) {
    const [{ data: directReportDeptMatch }, { data: directReportManagerRows }, { data: indirectReportRows }] =
      await Promise.all([
        supabase
          .from('user_departments')
          .select('dept_id')
          .in('user_id', directReportIds)
          .eq('dept_id', deptId)
          .maybeSingle(),
        supabase.from('dept_managers').select('user_id').in('user_id', directReportIds).limit(1),
        supabase
          .from('profiles')
          .select('id')
          .eq('org_id', profile.org_id)
          .in('reports_to_user_id', directReportIds)
          .limit(1),
      ]);
    canRaiseForDirectReportDepartment = Boolean(directReportDeptMatch);
    canCreateForAnyDepartmentByHierarchy = Boolean(
      (directReportManagerRows ?? []).length || (indirectReportRows ?? []).length
    );
  }

  if (
    !ownDeptMatch &&
    !dmMatch &&
    !canRaiseForDirectReportDepartment &&
    !canCreateForAnyDepartment &&
    !canCreateForAnyDepartmentByHierarchy
  ) {
    return {
      ok: false,
      error:
        'You can only raise requests for your departments, your direct reports departments, or any department if you are a senior hierarchy manager.',
    };
  }

  const jobTitle = form.jobTitle?.trim() ?? '';
  const gradeLevel = form.gradeLevel?.trim() ?? '';
  const salaryBand = form.salaryBand?.trim() ?? '';
  const businessCase = form.businessCase?.trim() ?? '';
  const headcountType = form.headcountType?.trim() ?? '';
  const costCenter = form.costCenter?.trim() ?? '';
  const targetStartWindow = form.targetStartWindow?.trim() ?? '';
  const hiringOwnerUserId = form.hiringOwnerUserId?.trim() || user.id;
  const idealCandidateProfile = form.idealCandidateProfile?.trim() ?? '';
  if (!jobTitle) return { ok: false, error: 'Job title is required.' };
  if (!gradeLevel) return { ok: false, error: 'Grade / level is required.' };
  if (!salaryBand) return { ok: false, error: 'Salary band is required.' };
  if (!businessCase) return { ok: false, error: 'Business case is required.' };
  if (!['new', 'backfill'].includes(headcountType)) return { ok: false, error: 'Headcount type is required.' };
  if (!costCenter) return { ok: false, error: 'Cost center is required.' };
  if (!targetStartWindow) return { ok: false, error: 'Target start window is required.' };
  if (!idealCandidateProfile) return { ok: false, error: 'Ideal candidate profile is required.' };

  if (!isRecruitmentHireReason(form.reasonForHire)) return { ok: false, error: 'Invalid reason for hire.' };
  if (!isRecruitmentContractType(form.contractType)) return { ok: false, error: 'Invalid contract type.' };
  if (!isRecruitmentUrgency(form.urgency)) return { ok: false, error: 'Invalid urgency.' };

  const startRaw = form.startDateNeeded?.trim() ?? '';
  if (!startRaw) return { ok: false, error: 'Start date needed is required.' };
  const startDate = new Date(`${startRaw}T12:00:00.000Z`);
  if (Number.isNaN(startDate.getTime())) return { ok: false, error: 'Invalid start date.' };
  const startDateNeeded = startRaw.slice(0, 10);

  const specificRequirements = form.specificRequirements?.trim() || null;

  const orgId = profile.org_id as string;

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch {
    return { ok: false, error: 'Server misconfigured (service role missing).' };
  }

  // Insert via service-role after explicit authz checks above; this avoids
  // org-admin submissions being blocked by stricter table RLS manager-only rules.
  const { data: inserted, error } = await admin
    .from('recruitment_requests')
    .insert({
      org_id: orgId,
      department_id: deptId,
      created_by: user.id,
      job_title: jobTitle,
      grade_level: gradeLevel,
      salary_band: salaryBand,
      business_case: businessCase,
      headcount_type: headcountType,
      cost_center: costCenter,
      budget_approved: Boolean(form.budgetApproved),
      target_start_window: targetStartWindow,
      hiring_owner_user_id: hiringOwnerUserId,
      reason_for_hire: form.reasonForHire,
      start_date_needed: startDateNeeded,
      contract_type: form.contractType,
      ideal_candidate_profile: idealCandidateProfile,
      specific_requirements: specificRequirements,
      urgency: form.urgency,
    })
    .select('id')
    .single();

  if (error || !inserted?.id) {
    return { ok: false, error: error?.message ?? 'Could not save request.' };
  }

  const requestId = inserted.id as string;

  const { data: dept } = await supabase
    .from('departments')
    .select('name')
    .eq('id', deptId)
    .eq('org_id', orgId)
    .maybeSingle();
  const departmentName = (dept?.name as string | undefined)?.trim() || 'Department';
  const submitterName = ((profile.full_name as string | undefined)?.trim() || user.email?.split('@')[0] || 'Manager')
    .trim();

  revalidatePath('/manager/recruitment');
  revalidatePath('/admin/recruitment');
  revalidatePath('/hr/hiring/requests');
  revalidatePath('/hr/hiring/requests');
  revalidatePath('/hr/hiring');

  // In-app notification to HR approvers
  try {
    void admin.rpc('recruitment_notify_new_request', {
      p_request_id: requestId,
      p_actor_name: submitterName,
    });
  } catch {
    // Non-fatal — notifications are best-effort
  }

  void sendRecruitmentRequestHrEmail({
    orgId,
    requestId,
    departmentName,
    submitterName,
    jobTitle,
    gradeLevel,
    salaryBand,
    reasonForHire: form.reasonForHire,
    startDateNeeded,
    contractType: form.contractType,
    idealCandidateProfile,
    specificRequirements,
    urgency: form.urgency,
  });

  return { ok: true, id: requestId };
}
