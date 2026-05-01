'use server';

import {
  sendApplicationStageEmail,
} from '@/lib/recruitment/sendApplicationCandidateEmails';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { issueCandidatePortalToken, issueOfferSigningPortalToken } from '@/lib/security/portalTokens';
import { createClient } from '@/lib/supabase/server';
import {
  isJobApplicationStage,
} from '@campsite/types';
import { revalidatePath } from 'next/cache';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export type ApplicationActionResult = { ok: true } | { ok: false; error: string };

function relationOne<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

function screeningAnswerDisplay(row: {
  type_snapshot: string;
  answer_text: string | null;
  answer_choice_id: string | null;
  answer_yes_no: boolean | null;
  options_snapshot: unknown;
}): string {
  if (row.type_snapshot === 'yes_no') {
    if (row.answer_yes_no === true) return 'Yes';
    if (row.answer_yes_no === false) return 'No';
    return '—';
  }
  if (row.type_snapshot === 'single_choice' && row.answer_choice_id) {
    const raw = row.options_snapshot;
    if (Array.isArray(raw)) {
      for (const o of raw) {
        const obj = o as { id?: string; label?: string };
        if (String(obj.id ?? '').trim() === row.answer_choice_id) {
          return String(obj.label ?? '').trim() || row.answer_choice_id;
        }
      }
    }
    return row.answer_choice_id;
  }
  return (row.answer_text ?? '').trim() || '—';
}

async function requireOrgPermission(permissionKey: string) {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { supabase, user: null as null, profile: null as null, orgId: null as null };

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, org_id, status, full_name')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.org_id || profile.status !== 'active') {
    return { supabase, user, profile: null as null, orgId: null as null };
  }
  const { data: allowed } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: profile.org_id,
    p_permission_key: permissionKey,
    p_context: {},
  });
  if (!allowed) {
    return { supabase, user, profile: null as null, orgId: null as null };
  }

  return { supabase, user, profile, orgId: profile.org_id as string };
}

async function requireOrgPermissionOrPanelForJob(permissionKey: string, jobListingId: string) {
  const base = await requireOrgPermission(permissionKey);
  if (base.profile && base.orgId) {
    return { ...base, isPanelist: false };
  }
  if (!base.user) return { ...base, isPanelist: false };

  const supabase = base.supabase;
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, org_id, status, full_name')
    .eq('id', base.user.id)
    .maybeSingle();
  if (!profile?.org_id || profile.status !== 'active') {
    return { supabase, user: base.user, profile: null as null, orgId: null as null, isPanelist: false };
  }

  const { data: panelRow } = await supabase
    .from('job_listing_panelists')
    .select('id')
    .eq('org_id', profile.org_id)
    .eq('job_listing_id', jobListingId)
    .eq('profile_id', base.user.id)
    .maybeSingle();
  if (!panelRow?.id) {
    return { supabase, user: base.user, profile: null as null, orgId: null as null, isPanelist: false };
  }

  return {
    supabase,
    user: base.user,
    profile,
    orgId: profile.org_id as string,
    isPanelist: true,
  };
}

async function autoMoveRecruitmentRequestToFilled(opts: {
  orgId: string;
  jobListingId: string;
  actorUserId: string;
}) {
  const admin = createServiceRoleClient();
  const { data: listing } = await admin
    .from('job_listings')
    .select('id, recruitment_request_id')
    .eq('id', opts.jobListingId)
    .eq('org_id', opts.orgId)
    .maybeSingle();
  const rid = String((listing as { recruitment_request_id?: string | null } | null)?.recruitment_request_id ?? '').trim();
  if (!rid) return;

  const { data: req } = await admin
    .from('recruitment_requests')
    .select('id, status')
    .eq('id', rid)
    .eq('org_id', opts.orgId)
    .maybeSingle();
  if (!req?.id) return;

  const prev = String((req as { status?: string | null }).status ?? '').trim();
  if (prev === 'filled') return;
  if (prev !== 'in_progress' && prev !== 'approved') return;

  await admin
    .from('recruitment_requests')
    .update({ status: 'filled', archived_at: new Date().toISOString() })
    .eq('id', rid)
    .eq('org_id', opts.orgId);

  await admin.from('recruitment_request_status_events').insert({
    request_id: rid,
    org_id: opts.orgId,
    from_status: prev,
    to_status: 'filled',
    changed_by: opts.actorUserId,
    note: 'Auto: candidate moved to offer sent',
  });
}

export async function updateJobApplicationStage(
  applicationId: string,
  newStage: string,
  opts: {
    notifyCandidate: boolean;
    messageBody: string;
    jobListingId: string;
  }
): Promise<ApplicationActionResult> {
  const id = applicationId?.trim();
  if (!id) return { ok: false, error: 'Missing application.' };
  if (!isJobApplicationStage(newStage)) return { ok: false, error: 'Invalid stage.' };

  const { supabase, profile, orgId, user } = await requireOrgPermissionOrPanelForJob(
    'applications.move_stage',
    opts.jobListingId
  );
  if (!profile || !orgId || !user) return { ok: false, error: 'Not allowed.' };

  let resolvedMessageBody = opts.messageBody.trim();
  if (opts.notifyCandidate && !resolvedMessageBody) {
    const defaultField =
      newStage === 'offer_sent'
        ? 'success_email_body'
        : newStage === 'rejected'
          ? 'rejection_email_body'
          : null;
    if (defaultField) {
      const { data: jobDefaults } = await supabase
        .from('job_listings')
        .select(defaultField)
        .eq('id', opts.jobListingId)
        .eq('org_id', orgId)
        .maybeSingle();
      resolvedMessageBody = String((jobDefaults as Record<string, unknown> | null)?.[defaultField] ?? '').trim();
    }
  }
  const notify = opts.notifyCandidate && resolvedMessageBody.length > 0;
  if (opts.notifyCandidate) {
    const { data: canNotify } = await supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'applications.notify_candidate',
      p_context: {},
    });
    if (!canNotify) {
      return { ok: false, error: 'You do not have permission to notify candidates.' };
    }
  }
  if (opts.notifyCandidate && !resolvedMessageBody) {
    return { ok: false, error: 'Add a message for the candidate or turn off email notification.' };
  }

  const { data: app, error: fetchErr } = await supabase
    .from('job_applications')
    .select(
      'id, org_id, job_listing_id, candidate_email, candidate_name, stage, job_listings(title), organisations(name)'
    )
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle();

  if (fetchErr || !app) return { ok: false, error: 'Application not found.' };

  const jl = relationOne(app.job_listings as { title: string } | { title: string }[] | null);
  const orgRow = relationOne(app.organisations as { name: string } | { name: string }[] | null);
  const jobTitle = jl?.title?.trim() || 'Role';
  const orgName = orgRow?.name?.trim() || 'Organisation';

  const { error: rpcErr } = await supabase.rpc('set_job_application_stage', {
    p_application_id: id,
    p_new_stage: newStage,
  });

  if (rpcErr) {
    return { ok: false, error: rpcErr.message ?? 'Could not update stage.' };
  }

  if (newStage !== String(app.stage ?? '')) {
    try {
      const admin = createServiceRoleClient();
      const actorName = (profile.full_name as string | undefined)?.trim() || null;
      void admin.rpc('application_notify_stage_changed', {
        p_application_id: id,
        p_old_stage: String(app.stage ?? ''),
        p_new_stage: newStage,
        p_actor_name: actorName,
        p_actor_user_id: user.id,
      });
    } catch {
      // Non-fatal (best-effort notifications)
    }
  }

  if (notify) {
    const body = resolvedMessageBody;
    const { error: insErr } = await supabase.from('job_application_messages').insert({
      org_id: orgId,
      job_application_id: id,
      body,
      created_by: user.id,
    });
    if (insErr) {
      return { ok: false, error: insErr.message ?? 'Stage updated but message was not saved.' };
    }
    let candidatePortalToken: string;
    try {
      const admin = createServiceRoleClient();
      candidatePortalToken = await issueCandidatePortalToken(admin, { applicationId: id, orgId });
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Could not issue tracker link.' };
    }

    await sendApplicationStageEmail({
      candidateEmail: app.candidate_email as string,
      candidateName: (app.candidate_name as string)?.trim() || 'there',
      orgName,
      jobTitle,
      stage: newStage,
      messageBody: body,
      portalToken: candidatePortalToken,
    });
  }

  if (newStage === 'offer_sent') {
    try {
      await autoMoveRecruitmentRequestToFilled({
        orgId,
        jobListingId: opts.jobListingId,
        actorUserId: user.id,
      });
    } catch {
      // Non-fatal (best-effort status sync)
    }
  }

  revalidatePath(`/admin/jobs/${opts.jobListingId}/applications`);
  revalidatePath('/admin/applications');
  revalidatePath(`/hr/jobs/${opts.jobListingId}/applications`);
  revalidatePath('/hr/applications');
  revalidatePath('/admin/recruitment');
  revalidatePath('/hr/hiring/requests');
  revalidatePath('/hr/hiring');
  return { ok: true };
}

export async function addJobApplicationNote(
  applicationId: string,
  body: string,
  jobListingId: string
): Promise<ApplicationActionResult> {
  const id = applicationId?.trim();
  const text = body?.trim();
  if (!id || !text) return { ok: false, error: 'Note cannot be empty.' };

  const { supabase, profile, orgId, user } = await requireOrgPermission('applications.add_internal_notes');
  if (!profile || !orgId || !user) return { ok: false, error: 'Not allowed.' };

  const { error } = await supabase.from('job_application_notes').insert({
    org_id: orgId,
    job_application_id: id,
    body: text,
    created_by: user.id,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/jobs/${jobListingId}/applications`);
  revalidatePath(`/hr/jobs/${jobListingId}/applications`);
  return { ok: true };
}

export async function sendCandidateOnlyMessage(
  applicationId: string,
  messageBody: string,
  jobListingId: string
): Promise<ApplicationActionResult> {
  const id = applicationId?.trim();
  const text = messageBody?.trim();
  if (!id || !text) return { ok: false, error: 'Message cannot be empty.' };

  const { supabase, profile, orgId, user } = await requireOrgPermission('applications.notify_candidate');
  if (!profile || !orgId || !user) return { ok: false, error: 'Not allowed.' };

  const { data: app, error: fetchErr } = await supabase
    .from('job_applications')
    .select(
      'candidate_email, candidate_name, stage, job_listings(title), organisations(name)'
    )
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle();

  if (fetchErr || !app) return { ok: false, error: 'Application not found.' };

  const jl = relationOne(app.job_listings as { title: string } | { title: string }[] | null);
  const orgRow = relationOne(app.organisations as { name: string } | { name: string }[] | null);
  const jobTitle = jl?.title?.trim() || 'Role';
  const orgName = orgRow?.name?.trim() || 'Organisation';

  const { error: insErr } = await supabase.from('job_application_messages').insert({
    org_id: orgId,
    job_application_id: id,
    body: text,
    created_by: user.id,
  });

  if (insErr) return { ok: false, error: insErr.message };

  let candidatePortalToken: string;
  try {
    const admin = createServiceRoleClient();
    candidatePortalToken = await issueCandidatePortalToken(admin, { applicationId: id, orgId });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not issue tracker link.' };
  }

  await sendApplicationStageEmail({
    candidateEmail: app.candidate_email as string,
    candidateName: (app.candidate_name as string)?.trim() || 'there',
    orgName,
    jobTitle,
    stage: (app.stage as string) ?? 'applied',
    messageBody: text,
    portalToken: candidatePortalToken,
  });

  revalidatePath(`/admin/jobs/${jobListingId}/applications`);
  revalidatePath('/admin/applications');
  revalidatePath(`/hr/jobs/${jobListingId}/applications`);
  revalidatePath('/hr/applications');
  return { ok: true };
}

export async function setInterviewJoiningInstructions(
  applicationId: string,
  joiningInstructions: string,
  jobListingId: string
): Promise<ApplicationActionResult> {
  const id = applicationId?.trim();
  if (!id) return { ok: false, error: 'Missing application.' };

  const { supabase, profile } = await requireOrgPermission('interviews.manage');
  if (!profile) return { ok: false, error: 'Not allowed.' };

  const { error } = await supabase.rpc('interview_joining_instructions_set', {
    p_application_id: id,
    p_instructions: joiningInstructions?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/jobs/${jobListingId}/applications`);
  revalidatePath(`/hr/jobs/${jobListingId}/applications`);
  return { ok: true };
}

export type JobApplicationScreeningAnswerDetail = {
  id: string;
  prompt_snapshot: string;
  type_snapshot: string;
  options_snapshot: unknown;
  answer_text: string | null;
  answer_choice_id: string | null;
  answer_yes_no: boolean | null;
  display_value: string;
  scores: Array<{ reviewer_profile_id: string; score: number }>;
  team_avg: number | null;
  my_score: number | null;
};

export type JobApplicationDetail = {
  application: {
    id: string;
    candidate_name: string;
    candidate_email: string;
    candidate_phone: string | null;
    candidate_location: string | null;
    current_title: string | null;
    linkedin_url: string | null;
    portfolio_url: string | null;
    motivation_text: string | null;
    stage: string;
    submitted_at: string;
    cv_storage_path: string | null;
    loom_url: string | null;
    staffsavvy_score: number | null;
    offer_letter_status: string | null;
    interview_joining_instructions: string | null;
    job_listings: { title: string } | null;
  };
  latest_offer: {
    id: string;
    status: string;
    signed_pdf_storage_path: string | null;
  } | null;
  notes: Array<{ id: string; body: string; created_at: string; created_by: string }>;
  messages: Array<{ id: string; body: string; created_at: string; created_by: string }>;
  screening_answers: JobApplicationScreeningAnswerDetail[];
};

export async function loadJobApplicationDetail(
  applicationId: string,
  jobListingId: string
): Promise<JobApplicationDetail | { error: string }> {
  const id = applicationId?.trim();
  if (!id) return { error: 'Missing application.' };

  const { supabase, profile, orgId } = await requireOrgPermissionOrPanelForJob('applications.view', jobListingId);
  if (!profile || !orgId) return { error: 'Not allowed.' };

  const { data: application, error: appErr } = await supabase
    .from('job_applications')
    .select(
      `
      id,
      candidate_name,
      candidate_email,
      candidate_phone,
      candidate_location,
      current_title,
      linkedin_url,
      portfolio_url,
      motivation_text,
      stage,
      submitted_at,
      cv_storage_path,
      loom_url,
      staffsavvy_score,
      offer_letter_status,
      interview_joining_instructions,
      job_listings ( title )
    `
    )
    .eq('id', id)
    .eq('org_id', orgId)
    .eq('job_listing_id', jobListingId)
    .maybeSingle();

  if (appErr || !application) return { error: 'Application not found.' };

  const [{ data: notes }, { data: messages }, { data: sAnswers }] = await Promise.all([
    supabase
      .from('job_application_notes')
      .select('id, body, created_at, created_by')
      .eq('job_application_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('job_application_messages')
      .select('id, body, created_at, created_by')
      .eq('job_application_id', id)
      .order('created_at', { ascending: true }),
    supabase
      .from('job_application_screening_answers')
      .select(
        'id, prompt_snapshot, type_snapshot, options_snapshot, answer_text, answer_choice_id, answer_yes_no, created_at'
      )
      .eq('job_application_id', id)
      .order('created_at', { ascending: true }),
  ]);

  const answerIds = (sAnswers ?? []).map((r) => r.id as string);
  let scoreRows: { screening_answer_id: string; reviewer_profile_id: string; score: number }[] = [];
  if (answerIds.length > 0) {
    const { data: sc } = await supabase
      .from('job_application_screening_scores')
      .select('screening_answer_id, reviewer_profile_id, score')
      .in('screening_answer_id', answerIds);
    scoreRows =
      (sc ?? []).map((r) => ({
        screening_answer_id: r.screening_answer_id as string,
        reviewer_profile_id: r.reviewer_profile_id as string,
        score: Number(r.score),
      })) ?? [];
  }

  const scoresByAnswer = new Map<string, { reviewer_profile_id: string; score: number }[]>();
  for (const s of scoreRows) {
    const list = scoresByAnswer.get(s.screening_answer_id) ?? [];
    list.push({ reviewer_profile_id: s.reviewer_profile_id, score: s.score });
    scoresByAnswer.set(s.screening_answer_id, list);
  }

  const viewerId = profile.id as string;
  const screening_answers: JobApplicationScreeningAnswerDetail[] = (sAnswers ?? []).map((raw) => {
    const aid = raw.id as string;
    const scores = scoresByAnswer.get(aid) ?? [];
    const nums = scores.map((s) => s.score);
    const team_avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    const mine = scores.find((s) => s.reviewer_profile_id === viewerId);
    return {
      id: aid,
      prompt_snapshot: String(raw.prompt_snapshot ?? ''),
      type_snapshot: String(raw.type_snapshot ?? ''),
      options_snapshot: raw.options_snapshot,
      answer_text: (raw.answer_text as string | null) ?? null,
      answer_choice_id: (raw.answer_choice_id as string | null) ?? null,
      answer_yes_no: (raw.answer_yes_no as boolean | null) ?? null,
      display_value: screeningAnswerDisplay({
        type_snapshot: String(raw.type_snapshot ?? ''),
        answer_text: (raw.answer_text as string | null) ?? null,
        answer_choice_id: (raw.answer_choice_id as string | null) ?? null,
        answer_yes_no: (raw.answer_yes_no as boolean | null) ?? null,
        options_snapshot: raw.options_snapshot,
      }),
      scores,
      team_avg,
      my_score: mine ? mine.score : null,
    };
  });

  const raw = application as Record<string, unknown>;
  const jl = relationOne(raw.job_listings as { title: string } | { title: string }[] | null);

  const normalized: JobApplicationDetail['application'] = {
    id: String(raw.id),
    candidate_name: String(raw.candidate_name),
    candidate_email: String(raw.candidate_email),
    candidate_phone: (raw.candidate_phone as string | null) ?? null,
    candidate_location: (raw.candidate_location as string | null) ?? null,
    current_title: (raw.current_title as string | null) ?? null,
    linkedin_url: (raw.linkedin_url as string | null) ?? null,
    portfolio_url: (raw.portfolio_url as string | null) ?? null,
    motivation_text: (raw.motivation_text as string | null) ?? null,
    stage: String(raw.stage),
    submitted_at: String(raw.submitted_at),
    cv_storage_path: (raw.cv_storage_path as string | null) ?? null,
    loom_url: (raw.loom_url as string | null) ?? null,
    staffsavvy_score: (raw.staffsavvy_score as number | null) ?? null,
    offer_letter_status: (raw.offer_letter_status as string | null) ?? null,
    interview_joining_instructions: (raw.interview_joining_instructions as string | null) ?? null,
    job_listings: jl ? { title: String(jl.title) } : null,
  };

  const { data: offerRow } = await supabase
    .from('application_offers')
    .select('id, status, signed_pdf_storage_path')
    .eq('job_application_id', id)
    .neq('status', 'superseded')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let latestOffer: JobApplicationDetail['latest_offer'] = null;
  if (offerRow) {
    latestOffer = {
      id: offerRow.id as string,
      status: offerRow.status as string,
      signed_pdf_storage_path: (offerRow.signed_pdf_storage_path as string | null) ?? null,
    };
  }

  return {
    application: normalized,
    latest_offer: latestOffer,
    notes: notes ?? [],
    messages: messages ?? [],
    screening_answers,
  };
}

export async function upsertJobApplicationScreeningScore(
  screeningAnswerId: string,
  score: number,
  jobListingId: string
): Promise<ApplicationActionResult> {
  const sid = screeningAnswerId?.trim();
  if (!sid) return { ok: false, error: 'Missing answer.' };
  const n = Math.round(Number(score));
  if (!Number.isFinite(n) || n < 1 || n > 5) {
    return { ok: false, error: 'Score must be between 1 and 5.' };
  }

  const { supabase, profile, orgId, user } = await requireOrgPermissionOrPanelForJob(
    'applications.view',
    jobListingId
  );
  if (!profile || !orgId || !user) return { ok: false, error: 'Not allowed.' };

  const [{ data: canScore }, { data: canManage }] = await Promise.all([
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'applications.score_screening',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'applications.manage',
      p_context: {},
    }),
  ]);
  if (!canScore && !canManage) {
    return { ok: false, error: 'Not allowed.' };
  }

  const { error } = await supabase.rpc('upsert_job_application_screening_score', {
    p_screening_answer_id: sid,
    p_score: n,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/jobs/${jobListingId}/applications`);
  revalidatePath(`/hr/jobs/${jobListingId}/applications`);
  return { ok: true };
}

export async function generateCandidateTrackerLink(
  applicationId: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const id = applicationId?.trim();
  if (!id) return { ok: false, error: 'Missing application.' };
  const { supabase, orgId } = await requireOrgPermission('applications.view');
  if (!orgId) return { ok: false, error: 'Not allowed.' };
  const { data: app } = await supabase
    .from('job_applications')
    .select('id')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle();
  if (!app) return { ok: false, error: 'Application not found.' };
  try {
    const admin = createServiceRoleClient();
    const token = await issueCandidatePortalToken(admin, { applicationId: id, orgId });
    return { ok: true, url: `/jobs/status/${encodeURIComponent(token)}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not issue tracker link.' };
  }
}

export async function generateOfferSigningLink(
  offerId: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const id = offerId?.trim();
  if (!id) return { ok: false, error: 'Missing offer.' };
  const { supabase, orgId } = await requireOrgPermission('offers.view');
  if (!orgId) return { ok: false, error: 'Not allowed.' };
  const { data: offer } = await supabase
    .from('application_offers')
    .select('id')
    .eq('id', id)
    .eq('org_id', orgId)
    .eq('status', 'sent')
    .maybeSingle();
  if (!offer) return { ok: false, error: 'Offer not available for signing.' };
  try {
    const admin = createServiceRoleClient();
    const token = await issueOfferSigningPortalToken(admin, { offerId: id, orgId });
    return { ok: true, url: `/jobs/offer-sign/${encodeURIComponent(token)}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not issue signing link.' };
  }
}
