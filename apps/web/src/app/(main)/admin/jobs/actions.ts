'use server';

import { generateDraftJobSlug, generatePublishedJobSlug } from '@/lib/jobs/jobListingSlug';
import { createClient } from '@/lib/supabase/server';
import {
  combinationModeHasChannel,
  isJobApplicationMode,
  isRecruitmentContractType,
  normaliseJobApplicationFlags,
  type JobApplicationMode,
} from '@campsite/types';
import { revalidatePath } from 'next/cache';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export type JobActionState = { ok: true } | { ok: false; error: string };

function revalidateJobs(jobId?: string) {
  revalidatePath('/admin/jobs');
  if (jobId) revalidatePath(`/admin/jobs/${jobId}/edit`);
  revalidatePath('/admin/recruitment');
  revalidatePath('/hr/jobs');
  if (jobId) revalidatePath(`/hr/jobs/${jobId}/edit`);
  revalidatePath('/hr/recruitment');
  revalidatePath('/jobs'); // public listing segment
}

export async function createJobListingFromRequest(recruitmentRequestId: string): Promise<
  JobActionState & { jobId?: string }
> {
  const rid = recruitmentRequestId?.trim();
  if (!rid) return { ok: false, error: 'Missing request.' };

  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, org_id, role, status')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.org_id || profile.status !== 'active') {
    return { ok: false, error: 'Not allowed.' };
  }
  const { data: canCreate } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: profile.org_id,
    p_permission_key: 'jobs.create',
    p_context: {},
  });
  if (!canCreate) {
    return { ok: false, error: 'Not allowed.' };
  }

  const orgId = profile.org_id as string;

  const { data: req, error: reqErr } = await supabase
    .from('recruitment_requests')
    .select(
      'id, org_id, department_id, job_title, grade_level, salary_band, contract_type, ideal_candidate_profile, specific_requirements, status'
    )
    .eq('id', rid)
    .eq('org_id', orgId)
    .maybeSingle();

  if (reqErr || !req) return { ok: false, error: 'Request not found.' };
  if ((req.status as string) !== 'approved') {
    return { ok: false, error: 'Only approved requests can become job listings.' };
  }

  const { data: existingLive } = await supabase
    .from('job_listings')
    .select('id')
    .eq('recruitment_request_id', rid)
    .eq('status', 'live')
    .maybeSingle();
  if (existingLive?.id) {
    return { ok: false, error: 'A live job already exists for this request.' };
  }

  const { data: existingDraft } = await supabase
    .from('job_listings')
    .select('id')
    .eq('recruitment_request_id', rid)
    .eq('status', 'draft')
    .maybeSingle();

  if (existingDraft?.id) {
    revalidateJobs(existingDraft.id as string);
    return { ok: true, jobId: existingDraft.id as string };
  }

  const ideal = (req.ideal_candidate_profile as string)?.trim() ?? '';
  const specific = (req.specific_requirements as string | null)?.trim();
  const advertSeed = [ideal, specific ? `\n\n${specific}` : ''].join('').trim();

  const draftSlug = generateDraftJobSlug();

  const { data: inserted, error: insErr } = await supabase
    .from('job_listings')
    .insert({
      org_id: orgId,
      recruitment_request_id: rid,
      department_id: req.department_id as string,
      created_by: user.id,
      slug: draftSlug,
      title: req.job_title as string,
      grade_level: req.grade_level as string,
      salary_band: req.salary_band as string,
      contract_type: req.contract_type as string,
      advert_copy: advertSeed,
      requirements: '',
      benefits: '',
      application_mode: 'cv',
      allow_cv: true,
      allow_loom: false,
      allow_staffsavvy: false,
      status: 'draft',
    })
    .select('id')
    .single();

  if (insErr || !inserted?.id) {
    return { ok: false, error: insErr?.message ?? 'Could not create listing.' };
  }

  const jobId = inserted.id as string;
  revalidateJobs(jobId);
  return { ok: true, jobId };
}

export async function updateJobListing(
  jobId: string,
  fields: {
    title: string;
    gradeLevel: string;
    salaryBand: string;
    contractType: string;
    advertCopy: string;
    requirements: string;
    benefits: string;
    applicationMode: string;
    allowCv: boolean;
    allowLoom: boolean;
    allowStaffsavvy: boolean;
  }
): Promise<JobActionState> {
  const id = jobId?.trim();
  if (!id) return { ok: false, error: 'Missing job.' };

  if (!isJobApplicationMode(fields.applicationMode)) {
    return { ok: false, error: 'Invalid application mode.' };
  }
  const mode = fields.applicationMode as JobApplicationMode;
  const flags = normaliseJobApplicationFlags(mode, {
    allowCv: fields.allowCv,
    allowLoom: fields.allowLoom,
    allowStaffsavvy: fields.allowStaffsavvy,
  });
  if (mode === 'combination' && !combinationModeHasChannel(fields)) {
    return { ok: false, error: 'Choose at least one application option.' };
  }
  if (!isRecruitmentContractType(fields.contractType)) {
    return { ok: false, error: 'Invalid contract type.' };
  }

  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role, status')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.org_id || profile.status !== 'active') {
    return { ok: false, error: 'Not allowed.' };
  }
  const { data: canEdit } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: profile.org_id,
    p_permission_key: 'jobs.edit',
    p_context: {},
  });
  if (!canEdit) {
    return { ok: false, error: 'Not allowed.' };
  }

  const { error } = await supabase
    .from('job_listings')
    .update({
      title: fields.title.trim(),
      grade_level: fields.gradeLevel.trim(),
      salary_band: fields.salaryBand.trim(),
      contract_type: fields.contractType.trim(),
      advert_copy: fields.advertCopy,
      requirements: fields.requirements,
      benefits: fields.benefits,
      application_mode: mode,
      allow_cv: flags.allow_cv,
      allow_loom: flags.allow_loom,
      allow_staffsavvy: flags.allow_staffsavvy,
    })
    .eq('id', id)
    .eq('org_id', profile.org_id as string);

  if (error) return { ok: false, error: error.message };
  revalidateJobs(id);
  return { ok: true };
}

export async function publishJobListing(jobId: string): Promise<JobActionState> {
  const id = jobId?.trim();
  if (!id) return { ok: false, error: 'Missing job.' };

  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role, status')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.org_id || profile.status !== 'active') {
    return { ok: false, error: 'Not allowed.' };
  }
  const { data: canPublish } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: profile.org_id,
    p_permission_key: 'jobs.publish',
    p_context: {},
  });
  if (!canPublish) {
    return { ok: false, error: 'Not allowed.' };
  }

  const orgId = profile.org_id as string;

  const { data: row, error: fetchErr } = await supabase
    .from('job_listings')
    .select('id, title, slug, status, recruitment_request_id')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle();

  if (fetchErr || !row) return { ok: false, error: 'Job not found.' };
  if ((row.status as string) === 'live') return { ok: true };
  if ((row.status as string) === 'archived') {
    return { ok: false, error: 'Cannot re-publish an archived listing. Create a new listing from the request.' };
  }

  const { data: otherLive } = await supabase
    .from('job_listings')
    .select('id')
    .eq('recruitment_request_id', row.recruitment_request_id as string)
    .eq('status', 'live')
    .neq('id', id)
    .maybeSingle();
  if (otherLive?.id) {
    return { ok: false, error: 'Another live job already exists for this recruitment request.' };
  }

  const title = (row.title as string)?.trim() || 'job';
  let attempts = 0;
  let lastError = 'Could not publish.';
  while (attempts < 8) {
    attempts += 1;
    const newSlug = generatePublishedJobSlug(title);
    const { error: upErr } = await supabase
      .from('job_listings')
      .update({
        slug: newSlug,
        status: 'live',
        published_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('org_id', orgId)
      .eq('status', 'draft');

    if (!upErr) {
      revalidateJobs(id);
      return { ok: true };
    }
    const isUniqueViolation =
      upErr.code === '23505' || String(upErr.message).toLowerCase().includes('unique');
    if (!isUniqueViolation) {
      lastError = upErr.message;
      break;
    }
    lastError = upErr.message;
  }

  return { ok: false, error: lastError };
}

export async function archiveJobListing(jobId: string): Promise<JobActionState> {
  const id = jobId?.trim();
  if (!id) return { ok: false, error: 'Missing job.' };

  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role, status')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.org_id || profile.status !== 'active') {
    return { ok: false, error: 'Not allowed.' };
  }
  const { data: canArchive } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: profile.org_id,
    p_permission_key: 'jobs.archive',
    p_context: {},
  });
  if (!canArchive) {
    return { ok: false, error: 'Not allowed.' };
  }

  const { error } = await supabase
    .from('job_listings')
    .update({ status: 'archived' })
    .eq('id', id)
    .eq('org_id', profile.org_id as string);

  if (error) return { ok: false, error: error.message };
  revalidateJobs(id);
  return { ok: true };
}
