'use server';

import { sendRecruitmentRequestHrEmail } from '@/lib/recruitment/sendRecruitmentRequestHrEmail';
import { createClient } from '@/lib/supabase/server';
import {
  isRecruitmentContractType,
  isRecruitmentHireReason,
  isRecruitmentUrgency,
  isManagerRole,
} from '@campsite/types';
import { revalidatePath } from 'next/cache';

export type CreateRecruitmentRequestState = { ok: true; id: string } | { ok: false; error: string };

export async function createRecruitmentRequest(form: {
  departmentId: string;
  jobTitle: string;
  gradeLevel: string;
  salaryBand: string;
  reasonForHire: string;
  startDateNeeded: string;
  contractType: string;
  idealCandidateProfile: string;
  specificRequirements: string;
  urgency: string;
}): Promise<CreateRecruitmentRequestState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, org_id, role, status, full_name')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.org_id || profile.status !== 'active') {
    return { ok: false, error: 'Account not active or missing organisation.' };
  }
  if (!isManagerRole(profile.role)) {
    return { ok: false, error: 'Only department managers can raise recruitment requests.' };
  }

  const deptId = form.departmentId?.trim();
  if (!deptId) return { ok: false, error: 'Choose a department.' };

  const { data: dm } = await supabase
    .from('dept_managers')
    .select('dept_id')
    .eq('user_id', user.id)
    .eq('dept_id', deptId)
    .maybeSingle();
  if (!dm) return { ok: false, error: 'You are not a manager for that department.' };

  const jobTitle = form.jobTitle?.trim() ?? '';
  const gradeLevel = form.gradeLevel?.trim() ?? '';
  const salaryBand = form.salaryBand?.trim() ?? '';
  const idealCandidateProfile = form.idealCandidateProfile?.trim() ?? '';
  if (!jobTitle) return { ok: false, error: 'Job title is required.' };
  if (!gradeLevel) return { ok: false, error: 'Grade / level is required.' };
  if (!salaryBand) return { ok: false, error: 'Salary band is required.' };
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

  const { data: inserted, error } = await supabase
    .from('recruitment_requests')
    .insert({
      org_id: orgId,
      department_id: deptId,
      created_by: user.id,
      job_title: jobTitle,
      grade_level: gradeLevel,
      salary_band: salaryBand,
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
