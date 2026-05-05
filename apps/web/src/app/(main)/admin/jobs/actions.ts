'use server';

import { randomUUID } from 'node:crypto';

import { generateDraftJobSlug, generatePublishedJobSlug } from '@/lib/jobs/jobListingSlug';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import {
  combinationModeHasChannel,
  isJobApplicationMode,
  isRecruitmentContractType,
  isScreeningQuestionType,
  normaliseJobApplicationFlags,
  type JobApplicationMode,
  type ScreeningQuestionOption,
} from '@campsite/types';
import { revalidatePath } from 'next/cache';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import {
  advertClosingDateToApplicationsCloseAtIso,
  advertReleaseDateToScheduledPublishAtIso,
} from '@/lib/datetime/advertClosingDateToApplicationsCloseAtIso';

export type JobActionState = { ok: true } | { ok: false; error: string };

function parseDateList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v ?? '').trim()).filter(Boolean);
}

function parseInterviewDateList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (typeof row === 'string') return row.trim();
      const rec = row as { date?: unknown; interviewDate?: unknown; interview_date?: unknown } | null;
      return String(rec?.date ?? rec?.interviewDate ?? rec?.interview_date ?? '').trim();
    })
    .filter(Boolean);
}

function isMissingNewJobListingColumnError(message: string | null | undefined): boolean {
  const msg = String(message ?? '').toLowerCase();
  if (!msg.includes('job_listings')) return false;
  return (
    msg.includes('hide_posted_date') ||
    msg.includes('scheduled_publish_at') ||
    msg.includes('shortlisting_dates') ||
    msg.includes('interview_dates') ||
    msg.includes('start_date_needed') ||
    msg.includes('role_profile_link') ||
    msg.includes('success_email_body') ||
    msg.includes('rejection_email_body') ||
    msg.includes('interview_invite_email_body') ||
    msg.includes('offer_template_id') ||
    msg.includes('contract_template_id')
  );
}

async function autoMoveRecruitmentRequestToInProgress(opts: {
  recruitmentRequestId: string | null | undefined;
  actorUserId: string;
  orgId: string;
}) {
  const rid = String(opts.recruitmentRequestId ?? '').trim();
  if (!rid) return;
  const admin = createServiceRoleClient();
  const { data: req } = await admin
    .from('recruitment_requests')
    .select('id, status')
    .eq('id', rid)
    .eq('org_id', opts.orgId)
    .maybeSingle();
  if (!req) return;
  const st = String((req as { status?: string | null }).status ?? '');
  if (st !== 'approved') return;

  await admin
    .from('recruitment_requests')
    .update({ status: 'in_progress', archived_at: null })
    .eq('id', rid)
    .eq('org_id', opts.orgId);

  await admin.from('recruitment_request_status_events').insert({
    request_id: rid,
    org_id: opts.orgId,
    from_status: st,
    to_status: 'in_progress',
    changed_by: opts.actorUserId,
    note: 'Auto: job posted',
  });
}

function revalidateJobs(jobId?: string) {
  revalidatePath('/admin/jobs');
  if (jobId) revalidatePath(`/admin/jobs/${jobId}/edit`);
  if (jobId) revalidatePath(`/admin/jobs/${jobId}/admin-legal`);
  revalidatePath('/admin/recruitment');
  revalidatePath('/hr/jobs');
  if (jobId) revalidatePath(`/hr/jobs/${jobId}/edit`);
  if (jobId) revalidatePath(`/hr/jobs/${jobId}/admin-legal`);
  revalidatePath('/hr/hiring/requests');
  revalidatePath('/hr/hiring/jobs');
  revalidatePath('/hr/hiring/requests');
  revalidatePath('/hr/hiring');
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

  const { data: orgRow } = await supabase
    .from('organisations')
    .select('timezone')
    .eq('id', orgId)
    .maybeSingle();
  const orgTimeZone = String((orgRow as { timezone?: string | null } | null)?.timezone ?? '').trim() || null;

  const { data: req, error: reqErr } = await supabase
    .from('recruitment_requests')
    .select(
      'id, org_id, department_id, job_title, grade_level, salary_band, contract_type, ideal_candidate_profile, specific_requirements, status, start_date_needed, role_profile_link, advert_release_date, advert_closing_date, shortlisting_dates, interview_schedule'
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
    .eq('org_id', orgId)
    .eq('recruitment_request_id', rid)
    .eq('status', 'live')
    .maybeSingle();
  if (existingLive?.id) {
    return { ok: false, error: 'A live job already exists for this request.' };
  }

  const { data: existingDraft } = await supabase
    .from('job_listings')
    .select('id, shortlisting_dates, interview_dates, start_date_needed, role_profile_link, scheduled_publish_at, applications_close_at')
    .eq('org_id', orgId)
    .eq('recruitment_request_id', rid)
    .eq('status', 'draft')
    .maybeSingle();

  if (existingDraft?.id) {
    const nextShortlistingDates = parseDateList(req.shortlisting_dates);
    const nextInterviewDates = parseInterviewDateList(req.interview_schedule);
    const nextStartDateNeeded = String(req.start_date_needed ?? '').trim() || null;
    const nextRoleProfileLink = String(req.role_profile_link ?? '').trim() || null;
    const nextScheduledPublishAt = advertReleaseDateToScheduledPublishAtIso(
      req.advert_release_date as string | null,
      orgTimeZone
    );
    const nextApplicationsCloseAt = advertClosingDateToApplicationsCloseAtIso(
      req.advert_closing_date as string | null,
      orgTimeZone
    );

    const hasExistingShortlisting = parseDateList((existingDraft as { shortlisting_dates?: unknown }).shortlisting_dates).length > 0;
    const hasExistingInterview = parseDateList((existingDraft as { interview_dates?: unknown }).interview_dates).length > 0;
    const hasExistingStartDate = Boolean(String((existingDraft as { start_date_needed?: unknown }).start_date_needed ?? '').trim());
    const hasExistingRoleProfile = Boolean(String((existingDraft as { role_profile_link?: unknown }).role_profile_link ?? '').trim());
    const hasExistingScheduled = Boolean(String((existingDraft as { scheduled_publish_at?: unknown }).scheduled_publish_at ?? '').trim());
    const hasExistingCloseAt = Boolean(String((existingDraft as { applications_close_at?: unknown }).applications_close_at ?? '').trim());

    const patch: Record<string, unknown> = {};
    if (!hasExistingShortlisting && nextShortlistingDates.length > 0) patch.shortlisting_dates = nextShortlistingDates;
    if (!hasExistingInterview && nextInterviewDates.length > 0) patch.interview_dates = nextInterviewDates;
    if (!hasExistingStartDate && nextStartDateNeeded) patch.start_date_needed = nextStartDateNeeded;
    if (!hasExistingRoleProfile && nextRoleProfileLink) patch.role_profile_link = nextRoleProfileLink;
    if (!hasExistingScheduled && nextScheduledPublishAt) patch.scheduled_publish_at = nextScheduledPublishAt;
    if (!hasExistingCloseAt && nextApplicationsCloseAt) patch.applications_close_at = nextApplicationsCloseAt;

    if (Object.keys(patch).length > 0) {
      let backfillResult = await supabase
        .from('job_listings')
        .update(patch)
        .eq('id', existingDraft.id as string)
        .eq('org_id', orgId)
        .eq('status', 'draft');
      if (backfillResult.error && isMissingNewJobListingColumnError(backfillResult.error.message)) {
        const legacyPatch: Record<string, unknown> = {};
        if (!hasExistingCloseAt && nextApplicationsCloseAt) legacyPatch.applications_close_at = nextApplicationsCloseAt;
        if (Object.keys(legacyPatch).length > 0) {
          backfillResult = await supabase
            .from('job_listings')
            .update(legacyPatch)
            .eq('id', existingDraft.id as string)
            .eq('org_id', orgId)
            .eq('status', 'draft');
        }
      }
      if (backfillResult.error) {
        return { ok: false, error: backfillResult.error.message };
      }
    }

    revalidateJobs(existingDraft.id as string);
    return { ok: true, jobId: existingDraft.id as string };
  }

  const ideal = (req.ideal_candidate_profile as string)?.trim() ?? '';
  const specific = (req.specific_requirements as string | null)?.trim();
  const advertSeed = [ideal, specific ? `\n\n${specific}` : ''].join('').trim();

  const draftSlug = generateDraftJobSlug();

  let insertResult = await supabase
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
      hide_posted_date: false,
      scheduled_publish_at: advertReleaseDateToScheduledPublishAtIso(
        req.advert_release_date as string | null,
        orgTimeZone
      ),
      shortlisting_dates: parseDateList(req.shortlisting_dates),
      interview_dates: parseInterviewDateList(req.interview_schedule),
      start_date_needed: String(req.start_date_needed ?? '').trim() || null,
      role_profile_link: String(req.role_profile_link ?? '').trim() || null,
      applications_close_at: advertClosingDateToApplicationsCloseAtIso(
        req.advert_closing_date as string | null,
        orgTimeZone
      ),
      status: 'draft',
    })
    .select('id')
    .single();
  if (insertResult.error && isMissingNewJobListingColumnError(insertResult.error.message)) {
    insertResult = await supabase
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
        applications_close_at: advertClosingDateToApplicationsCloseAtIso(
          req.advert_closing_date as string | null,
          orgTimeZone
        ),
        status: 'draft',
      })
      .select('id')
      .single();
  }
  const inserted = insertResult.data;
  const insErr = insertResult.error;

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
    allowApplicationQuestions: boolean;
    diversityTargetPct: number | null;
    diversityIncludedCodes: string[];
    /** ISO or datetime-local string; empty clears. */
    applicationsCloseAt: string | null;
    scheduledPublishAt: string | null;
    hidePostedDate: boolean;
    shortlistingDates: string[];
    interviewDates: string[];
    startDateNeeded: string | null;
    roleProfileLink: string | null;
    applicationQuestionSetId: string | null;
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
    allowApplicationQuestions: fields.allowApplicationQuestions,
  });
  if (mode === 'combination' && !combinationModeHasChannel(fields)) {
    return { ok: false, error: 'Choose at least one application option.' };
  }
  if (!isRecruitmentContractType(fields.contractType)) {
    return { ok: false, error: 'Invalid contract type.' };
  }

  let applicationsCloseAt: string | null = null;
  const rawClose = fields.applicationsCloseAt?.trim();
  if (rawClose) {
    const t = Date.parse(rawClose);
    if (Number.isNaN(t)) {
      return { ok: false, error: 'Invalid applications close date.' };
    }
    applicationsCloseAt = new Date(t).toISOString();
  }
  let scheduledPublishAt: string | null = null;
  const rawScheduled = fields.scheduledPublishAt?.trim();
  if (rawScheduled) {
    const t = Date.parse(rawScheduled);
    if (Number.isNaN(t)) {
      return { ok: false, error: 'Invalid scheduled publish date.' };
    }
    scheduledPublishAt = new Date(t).toISOString();
  }
  const shortlistingDates = Array.from(
    new Set((fields.shortlistingDates ?? []).map((d) => String(d ?? '').trim()).filter(Boolean)),
  );
  const interviewDates = Array.from(
    new Set((fields.interviewDates ?? []).map((d) => String(d ?? '').trim()).filter(Boolean)),
  );
  const startDateNeeded = String(fields.startDateNeeded ?? '').trim() || null;
  const roleProfileLink = String(fields.roleProfileLink ?? '').trim() || null;

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

  const setId = fields.applicationQuestionSetId?.trim() || null;
  if (setId) {
    const { data: setRow, error: setErr } = await supabase
      .from('org_application_question_sets')
      .select('id')
      .eq('id', setId)
      .eq('org_id', profile.org_id as string)
      .maybeSingle();
    if (setErr || !setRow) {
      return { ok: false, error: 'Selected application form is invalid for this organisation.' };
    }
  }

  let updateResult = await supabase
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
      allow_application_questions: flags.allow_application_questions,
      diversity_target_pct: fields.diversityTargetPct,
      diversity_included_codes: fields.diversityIncludedCodes,
      applications_close_at: applicationsCloseAt,
      scheduled_publish_at: scheduledPublishAt,
      hide_posted_date: Boolean(fields.hidePostedDate),
      shortlisting_dates: shortlistingDates,
      interview_dates: interviewDates,
      start_date_needed: startDateNeeded,
      role_profile_link: roleProfileLink,
      application_question_set_id: setId,
    })
    .eq('id', id)
    .eq('org_id', profile.org_id as string);
  if (updateResult.error && isMissingNewJobListingColumnError(updateResult.error.message)) {
    updateResult = await supabase
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
        allow_application_questions: flags.allow_application_questions,
        diversity_target_pct: fields.diversityTargetPct,
        diversity_included_codes: fields.diversityIncludedCodes,
        applications_close_at: applicationsCloseAt,
        application_question_set_id: setId,
      })
      .eq('id', id)
      .eq('org_id', profile.org_id as string);
  }
  const error = updateResult.error;

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
    .select('id, title, slug, status, recruitment_request_id, application_question_set_id')
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
  if (!String(row.application_question_set_id ?? '').trim()) {
    return { ok: false, error: 'Choose an application form for this advert before publishing.' };
  }

  const title = (row.title as string)?.trim() || 'job';
  let attempts = 0;
  let lastError = 'Could not publish.';
  while (attempts < 8) {
    attempts += 1;
    const newSlug = generatePublishedJobSlug(title);
    let publishResult = await supabase
      .from('job_listings')
      .update({
        slug: newSlug,
        status: 'live',
        published_at: new Date().toISOString(),
        scheduled_publish_at: null,
      })
      .eq('id', id)
      .eq('org_id', orgId)
      .eq('status', 'draft');
    if (publishResult.error && isMissingNewJobListingColumnError(publishResult.error.message)) {
      publishResult = await supabase
        .from('job_listings')
        .update({
          slug: newSlug,
          status: 'live',
          published_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('org_id', orgId)
        .eq('status', 'draft');
    }
    const upErr = publishResult.error;

    if (!upErr) {
      await autoMoveRecruitmentRequestToInProgress({
        recruitmentRequestId: row.recruitment_request_id as string | null | undefined,
        actorUserId: user.id,
        orgId,
      });
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

export async function unarchiveJobListing(jobId: string): Promise<JobActionState> {
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

  const orgId = profile.org_id as string;

  const { data: row, error: fetchErr } = await supabase
    .from('job_listings')
    .select('id, status, recruitment_request_id')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle();

  if (fetchErr || !row) return { ok: false, error: 'Job not found.' };
  const st = row.status as string;
  if (st === 'draft') return { ok: true };
  if (st === 'live') {
    return {
      ok: false,
      error: 'This listing is already live. Archive it first if you need to take it down.',
    };
  }
  if (st !== 'archived') {
    return { ok: false, error: 'Only archived listings can be restored to draft.' };
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

  const { error } = await supabase
    .from('job_listings')
    .update({ status: 'draft' })
    .eq('id', id)
    .eq('org_id', orgId)
    .eq('status', 'archived');

  if (error) return { ok: false, error: error.message };
  revalidateJobs(id);
  return { ok: true };
}

export async function updateJobAdminLegalSettings(
  jobId: string,
  fields: {
    successEmailBody: string | null;
    rejectionEmailBody: string | null;
    interviewInviteEmailBody: string | null;
    offerTemplateId: string | null;
    contractTemplateId: string | null;
  },
): Promise<JobActionState> {
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
  const { data: canEdit } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: profile.org_id,
    p_permission_key: 'jobs.edit',
    p_context: {},
  });
  if (!canEdit) {
    return { ok: false, error: 'Not allowed.' };
  }

  const offerTemplateId = String(fields.offerTemplateId ?? '').trim() || null;
  const contractTemplateId = String(fields.contractTemplateId ?? '').trim() || null;
  if (offerTemplateId) {
    const { data: tpl, error: tplErr } = await supabase
      .from('offer_letter_templates')
      .select('id')
      .eq('id', offerTemplateId)
      .eq('org_id', profile.org_id as string)
      .maybeSingle();
    if (tplErr || !tpl) return { ok: false, error: 'Selected offer template is invalid.' };
  }
  if (contractTemplateId) {
    const { data: tpl, error: tplErr } = await supabase
      .from('offer_letter_templates')
      .select('id')
      .eq('id', contractTemplateId)
      .eq('org_id', profile.org_id as string)
      .maybeSingle();
    if (tplErr || !tpl) return { ok: false, error: 'Selected contract template is invalid.' };
  }

  const updateResult = await supabase
    .from('job_listings')
    .update({
      success_email_body: String(fields.successEmailBody ?? '').trim() || null,
      rejection_email_body: String(fields.rejectionEmailBody ?? '').trim() || null,
      interview_invite_email_body: String(fields.interviewInviteEmailBody ?? '').trim() || null,
      offer_template_id: offerTemplateId,
      contract_template_id: contractTemplateId,
    })
    .eq('id', id)
    .eq('org_id', profile.org_id as string);

  if (updateResult.error && isMissingNewJobListingColumnError(updateResult.error.message)) {
    return { ok: false, error: 'Run latest migrations before using Admin & legal settings.' };
  }
  if (updateResult.error) return { ok: false, error: updateResult.error.message };

  revalidateJobs(id);
  return { ok: true };
}

export type JobScreeningQuestionPersist = {
  id: string;
  sortOrder: number;
  questionType: string;
  prompt: string;
  helpText: string;
  required: boolean;
  isPageBreak: boolean;
  scoringEnabled: boolean;
  scoringScaleMax: number;
  initiallyHidden: boolean;
  locked: boolean;
  maxLength: number | null;
  options: ScreeningQuestionOption[] | null;
};

function validateJobScreeningQuestionsPersist(questions: JobScreeningQuestionPersist[]): string | null {
  for (const q of questions) {
    if (!isScreeningQuestionType(q.questionType)) {
      return 'Invalid application question type.';
    }
    if (!q.prompt?.trim()) {
      return 'Each application question needs a prompt.';
    }
    if (q.questionType === 'single_choice') {
      const opts = q.options ?? [];
      if (opts.length < 1) {
        return 'Multiple-choice questions need at least one option.';
      }
      for (const o of opts) {
        if (!o.id?.trim() || !o.label?.trim()) {
          return 'Each choice needs an id and label.';
        }
      }
    }
    if (q.maxLength != null && (q.maxLength < 1 || q.maxLength > 20000)) {
      return 'Max length must be between 1 and 20000.';
    }
    if (q.questionType === 'section_title') {
      if (q.required) return 'Section titles cannot be required.';
      if (q.scoringEnabled) return 'Section titles cannot use scoring.';
      if (q.scoringScaleMax !== 0) return 'Section titles must use scoring scale 0.';
      if (q.isPageBreak) return 'Section title cannot be combined with a page break.';
    }
    if (!Number.isInteger(q.scoringScaleMax) || q.scoringScaleMax < 0 || q.scoringScaleMax > 5) {
      return 'Scoring scale must be an integer between 0 and 5.';
    }
  }
  return null;
}

type ScreeningQuestionDbRow = {
  sort_order?: number | null;
  question_type: string;
  prompt: string;
  help_text?: string | null;
  required?: boolean | null;
  is_page_break?: boolean | null;
  scoring_enabled?: boolean | null;
  scoring_scale_max?: number | null;
  initially_hidden?: boolean | null;
  locked?: boolean | null;
  max_length?: number | null;
  options?: unknown;
};

/** Map DB rows to editor payloads with fresh question and choice ids. */
function mapScreeningQuestionDbRowsToPersist(
  rows: ScreeningQuestionDbRow[],
): { ok: true; questions: JobScreeningQuestionPersist[] } | { ok: false; error: string } {
  const sorted = [...rows].sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
  const questions: JobScreeningQuestionPersist[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const r = sorted[i]!;
    const qt = String(r.question_type ?? '');
    if (!isScreeningQuestionType(qt)) {
      return { ok: false, error: 'Source has an unsupported question type.' };
    }
    const prompt = String(r.prompt ?? '').trim();
    if (!prompt) {
      return { ok: false, error: 'Source has a question with an empty prompt.' };
    }
    const parsedOpts = parseScreeningOptionsFromRow(r.options);
    if (qt === 'single_choice' && (!parsedOpts || parsedOpts.length < 1)) {
      return { ok: false, error: 'Source has an incomplete multiple-choice question.' };
    }
    const options =
      qt === 'single_choice' && parsedOpts
        ? parsedOpts.map((o) => ({ id: randomUUID(), label: o.label }))
        : null;

    questions.push({
      id: randomUUID(),
      sortOrder: i,
      questionType: qt,
      prompt,
      helpText: String(r.help_text ?? '').trim(),
      required: Boolean(r.required),
      isPageBreak: Boolean((r as { is_page_break?: boolean | null }).is_page_break),
      scoringEnabled: (r as { scoring_enabled?: boolean | null }).scoring_enabled !== false,
      scoringScaleMax:
        Number.isInteger((r as { scoring_scale_max?: number | null }).scoring_scale_max) &&
        Number((r as { scoring_scale_max?: number | null }).scoring_scale_max) >= 0 &&
        Number((r as { scoring_scale_max?: number | null }).scoring_scale_max) <= 5
          ? Number((r as { scoring_scale_max?: number | null }).scoring_scale_max)
          : 5,
      initiallyHidden: Boolean((r as { initially_hidden?: boolean | null }).initially_hidden),
      locked: Boolean((r as { locked?: boolean | null }).locked),
      maxLength: r.max_length == null ? null : Number(r.max_length),
      options,
    });
  }
  return { ok: true, questions };
}

export async function replaceJobScreeningQuestions(
  jobId: string,
  questions: JobScreeningQuestionPersist[]
): Promise<JobActionState> {
  const jid = jobId?.trim();
  if (!jid) return { ok: false, error: 'Missing job.' };

  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.org_id || profile.status !== 'active') {
    return { ok: false, error: 'Not allowed.' };
  }
  const orgId = profile.org_id as string;

  const { data: canEdit } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: orgId,
    p_permission_key: 'jobs.edit',
    p_context: {},
  });
  if (!canEdit) {
    return { ok: false, error: 'Not allowed.' };
  }

  const { data: jobRow, error: jobErr } = await supabase
    .from('job_listings')
    .select('id')
    .eq('id', jid)
    .eq('org_id', orgId)
    .maybeSingle();
  if (jobErr || !jobRow) return { ok: false, error: 'Job not found.' };

  const validationErr = validateJobScreeningQuestionsPersist(questions);
  if (validationErr) {
    return { ok: false, error: validationErr };
  }

  const keepIds = questions.map((q) => q.id).filter(Boolean);
  const { data: existing } = await supabase
    .from('job_listing_screening_questions')
    .select('id')
    .eq('job_listing_id', jid);

  const existingIds = (existing ?? []).map((r) => r.id as string);
  const toRemove = existingIds.filter((eid) => !keepIds.includes(eid));
  if (toRemove.length > 0) {
    const { error: delErr } = await supabase
      .from('job_listing_screening_questions')
      .delete()
      .in('id', toRemove)
      .eq('job_listing_id', jid);
    if (delErr) return { ok: false, error: delErr.message };
  }

  for (const q of questions) {
    const row = {
      id: q.id,
      job_listing_id: jid,
      sort_order: q.sortOrder,
      question_type: q.questionType,
      prompt: q.prompt.trim(),
      help_text: q.helpText.trim() ? q.helpText.trim() : null,
      required: q.required,
      is_page_break: Boolean(q.isPageBreak),
      scoring_enabled: q.scoringEnabled !== false,
      scoring_scale_max: q.scoringScaleMax,
      initially_hidden: Boolean(q.initiallyHidden),
      locked: Boolean(q.locked),
      max_length: q.maxLength,
      options: q.questionType === 'single_choice' ? (q.options ?? []) : null,
    };
    const { error: upErr } = await supabase.from('job_listing_screening_questions').upsert(row, { onConflict: 'id' });
    if (upErr) return { ok: false, error: upErr.message };
  }

  revalidateJobs(jid);
  revalidatePath(`/admin/jobs/${jid}/applications`);
  revalidatePath(`/hr/jobs/${jid}/applications`);
  revalidatePath('/jobs');
  return { ok: true };
}

export type SiblingJobForQuestionImport = {
  id: string;
  title: string;
  status: string;
};

function parseScreeningOptionsFromRow(raw: unknown): ScreeningQuestionOption[] | null {
  if (!Array.isArray(raw)) return null;
  const options = raw
    .map((o) => {
      const row = o as { id?: string; label?: string };
      return { id: String(row.id ?? '').trim(), label: String(row.label ?? '').trim() };
    })
    .filter((o) => o.id && o.label);
  return options.length > 0 ? options : null;
}

/** Other listings in the same org (for importing question sets). */
export async function listSiblingJobsForQuestionImport(
  excludeJobId: string,
): Promise<{ ok: true; jobs: SiblingJobForQuestionImport[] } | { ok: false; error: string }> {
  const ex = excludeJobId?.trim();
  if (!ex) return { ok: false, error: 'Missing job.' };

  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: profile } = await supabase.from('profiles').select('org_id, status').eq('id', user.id).maybeSingle();
  if (!profile?.org_id || profile.status !== 'active') {
    return { ok: false, error: 'Not allowed.' };
  }
  const orgId = profile.org_id as string;

  const { data: canEdit } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: orgId,
    p_permission_key: 'jobs.edit',
    p_context: {},
  });
  if (!canEdit) {
    return { ok: false, error: 'Not allowed.' };
  }

  const { data, error } = await supabase
    .from('job_listings')
    .select('id, title, status')
    .eq('org_id', orgId)
    .neq('id', ex)
    .in('status', ['draft', 'live'])
    .order('updated_at', { ascending: false })
    .limit(100);

  if (error) return { ok: false, error: error.message };

  const jobs = (data ?? []).map((r) => ({
    id: r.id as string,
    title: String(r.title ?? '').trim() || 'Untitled role',
    status: String(r.status ?? ''),
  }));
  return { ok: true, jobs };
}

/** Clone another job’s application questions with fresh ids (append to current editor state, then Save). */
export async function cloneJobScreeningQuestionsFromJob(
  sourceJobId: string,
  currentJobId: string,
): Promise<{ ok: true; questions: JobScreeningQuestionPersist[] } | { ok: false; error: string }> {
  const src = sourceJobId?.trim();
  const cur = currentJobId?.trim();
  if (!src || !cur || src === cur) {
    return { ok: false, error: 'Pick a different job to copy from.' };
  }

  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: profile } = await supabase.from('profiles').select('org_id, status').eq('id', user.id).maybeSingle();
  if (!profile?.org_id || profile.status !== 'active') {
    return { ok: false, error: 'Not allowed.' };
  }
  const orgId = profile.org_id as string;

  const { data: canEdit } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: orgId,
    p_permission_key: 'jobs.edit',
    p_context: {},
  });
  if (!canEdit) {
    return { ok: false, error: 'Not allowed.' };
  }

  const { data: sourceRow, error: srcErr } = await supabase
    .from('job_listings')
    .select('id')
    .eq('id', src)
    .eq('org_id', orgId)
    .maybeSingle();
  if (srcErr || !sourceRow) {
    return { ok: false, error: 'Source job not found.' };
  }

  const { data: rows, error: qErr } = await supabase
    .from('job_listing_screening_questions')
    .select('sort_order, question_type, prompt, help_text, required, max_length, options, is_page_break, scoring_enabled, scoring_scale_max, initially_hidden, locked')
    .eq('job_listing_id', src)
    .order('sort_order', { ascending: true });

  if (qErr) return { ok: false, error: qErr.message };
  if (!rows?.length) {
    return { ok: false, error: 'That job has no application questions to copy.' };
  }

  return mapScreeningQuestionDbRowsToPersist(rows as ScreeningQuestionDbRow[]);
}

export type OrgApplicationQuestionSetSummary = {
  id: string;
  name: string;
  updated_at: string;
};

/** Named reusable question sets for the current organisation. */
export async function listOrgApplicationQuestionSets(): Promise<
  { ok: true; sets: OrgApplicationQuestionSetSummary[] } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: profile } = await supabase.from('profiles').select('org_id, status').eq('id', user.id).maybeSingle();
  if (!profile?.org_id || profile.status !== 'active') {
    return { ok: false, error: 'Not allowed.' };
  }
  const orgId = profile.org_id as string;

  const { data: canView } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: orgId,
    p_permission_key: 'jobs.view',
    p_context: {},
  });
  if (!canView) {
    return { ok: false, error: 'Not allowed.' };
  }

  const { data, error } = await supabase
    .from('org_application_question_sets')
    .select('id, name, updated_at')
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false })
    .limit(80);

  if (error) return { ok: false, error: error.message };

  const sets = (data ?? []).map((r) => ({
    id: r.id as string,
    name: String(r.name ?? '').trim(),
    updated_at: String(r.updated_at ?? ''),
  }));
  return { ok: true, sets };
}

/** Persist the current editor questions as a reusable org-wide set. */
export async function createOrgApplicationQuestionSetFromQuestions(
  name: string,
  questions: JobScreeningQuestionPersist[],
): Promise<JobActionState> {
  const trimmed = name?.trim() ?? '';
  if (!trimmed) return { ok: false, error: 'Enter a name for this set.' };
  if (trimmed.length > 120) return { ok: false, error: 'Name is too long (max 120 characters).' };
  if (questions.length < 1) {
    return { ok: false, error: 'Add at least one question before saving a set.' };
  }

  const validationErr = validateJobScreeningQuestionsPersist(questions);
  if (validationErr) {
    return { ok: false, error: validationErr };
  }

  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: profile } = await supabase.from('profiles').select('org_id, status').eq('id', user.id).maybeSingle();
  if (!profile?.org_id || profile.status !== 'active') {
    return { ok: false, error: 'Not allowed.' };
  }
  const orgId = profile.org_id as string;

  const { data: canEdit } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: orgId,
    p_permission_key: 'jobs.edit',
    p_context: {},
  });
  if (!canEdit) {
    return { ok: false, error: 'Not allowed.' };
  }

  const { data: inserted, error: insErr } = await supabase
    .from('org_application_question_sets')
    .insert({
      org_id: orgId,
      name: trimmed,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (insErr || !inserted?.id) {
    return { ok: false, error: insErr?.message ?? 'Could not create set.' };
  }

  const setId = inserted.id as string;
  const itemRows = questions.map((q, i) => ({
    set_id: setId,
    sort_order: i,
    question_type: q.questionType,
    prompt: q.prompt.trim(),
    help_text: q.helpText.trim() ? q.helpText.trim() : null,
    required: q.required,
    is_page_break: Boolean(q.isPageBreak),
    scoring_enabled: q.scoringEnabled !== false,
    scoring_scale_max: q.scoringScaleMax,
    initially_hidden: Boolean(q.initiallyHidden),
    locked: Boolean(q.locked),
    max_length: q.maxLength,
    options: q.questionType === 'single_choice' ? (q.options ?? []) : null,
  }));

  const { error: itemsErr } = await supabase.from('org_application_question_set_items').insert(itemRows);
  if (itemsErr) {
    await supabase.from('org_application_question_sets').delete().eq('id', setId).eq('org_id', orgId);
    return { ok: false, error: itemsErr.message };
  }

  return { ok: true };
}

export async function loadOrgApplicationQuestionSetAsPersist(
  setId: string,
): Promise<{ ok: true; questions: JobScreeningQuestionPersist[] } | { ok: false; error: string }> {
  const sid = setId?.trim();
  if (!sid) return { ok: false, error: 'Missing set.' };

  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: profile } = await supabase.from('profiles').select('org_id, status').eq('id', user.id).maybeSingle();
  if (!profile?.org_id || profile.status !== 'active') {
    return { ok: false, error: 'Not allowed.' };
  }
  const orgId = profile.org_id as string;

  const { data: canView } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: orgId,
    p_permission_key: 'jobs.view',
    p_context: {},
  });
  if (!canView) {
    return { ok: false, error: 'Not allowed.' };
  }

  const { data: rows, error } = await supabase
    .from('org_application_question_set_items')
    .select('sort_order, question_type, prompt, help_text, required, max_length, options, is_page_break, scoring_enabled, scoring_scale_max, initially_hidden, locked')
    .eq('set_id', sid)
    .order('sort_order', { ascending: true });

  if (error) return { ok: false, error: error.message };
  if (!rows?.length) {
    return { ok: false, error: 'This set has no questions.' };
  }

  return mapScreeningQuestionDbRowsToPersist(rows as ScreeningQuestionDbRow[]);
}

export async function deleteOrgApplicationQuestionSet(setId: string): Promise<JobActionState> {
  const sid = setId?.trim();
  if (!sid) return { ok: false, error: 'Missing set.' };

  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: profile } = await supabase.from('profiles').select('org_id, status').eq('id', user.id).maybeSingle();
  if (!profile?.org_id || profile.status !== 'active') {
    return { ok: false, error: 'Not allowed.' };
  }
  const orgId = profile.org_id as string;

  const { data: canEdit } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: orgId,
    p_permission_key: 'jobs.edit',
    p_context: {},
  });
  if (!canEdit) {
    return { ok: false, error: 'Not allowed.' };
  }

  const { error } = await supabase.from('org_application_question_sets').delete().eq('id', sid).eq('org_id', orgId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
