'use server';

import { randomUUID } from 'node:crypto';

import { generateDraftJobSlug, generatePublishedJobSlug } from '@/lib/jobs/jobListingSlug';
import { createClient } from '@/lib/supabase/server';
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

export type JobActionState = { ok: true } | { ok: false; error: string };

function revalidateJobs(jobId?: string) {
  revalidatePath('/admin/jobs');
  if (jobId) revalidatePath(`/admin/jobs/${jobId}/edit`);
  revalidatePath('/admin/recruitment');
  revalidatePath('/hr/jobs');
  if (jobId) revalidatePath(`/hr/jobs/${jobId}/edit`);
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
    allowApplicationQuestions: boolean;
    diversityTargetPct: number | null;
    diversityIncludedCodes: string[];
    /** ISO or datetime-local string; empty clears. */
    applicationsCloseAt: string | null;
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
      allow_application_questions: flags.allow_application_questions,
      diversity_target_pct: fields.diversityTargetPct,
      diversity_included_codes: fields.diversityIncludedCodes,
      applications_close_at: applicationsCloseAt,
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

export type JobScreeningQuestionPersist = {
  id: string;
  sortOrder: number;
  questionType: string;
  prompt: string;
  helpText: string;
  required: boolean;
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
  }
  return null;
}

type ScreeningQuestionDbRow = {
  sort_order?: number | null;
  question_type: string;
  prompt: string;
  help_text?: string | null;
  required?: boolean | null;
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
    .select('sort_order, question_type, prompt, help_text, required, max_length, options')
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
    .select('sort_order, question_type, prompt, help_text, required, max_length, options')
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
