'use server';

import {
  sendApplicationStageEmail,
} from '@/lib/recruitment/sendApplicationCandidateEmails';
import { createClient } from '@/lib/supabase/server';
import {
  isJobApplicationStage,
  isOrgAdminRole,
} from '@campsite/types';
import { revalidatePath } from 'next/cache';

export type ApplicationActionResult = { ok: true } | { ok: false; error: string };

function relationOne<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

async function requireOrgAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null as null, profile: null as null, orgId: null as null };

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, org_id, role, status')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.org_id || profile.status !== 'active' || !isOrgAdminRole(profile.role)) {
    return { supabase, user, profile: null as null, orgId: null as null };
  }

  return { supabase, user, profile, orgId: profile.org_id as string };
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

  const { supabase, profile, orgId, user } = await requireOrgAdmin();
  if (!profile || !orgId || !user) return { ok: false, error: 'Not allowed.' };

  const notify = opts.notifyCandidate && opts.messageBody.trim().length > 0;
  if (opts.notifyCandidate && !opts.messageBody.trim()) {
    return { ok: false, error: 'Add a message for the candidate or turn off email notification.' };
  }

  const { data: app, error: fetchErr } = await supabase
    .from('job_applications')
    .select(
      'id, org_id, job_listing_id, candidate_email, candidate_name, portal_token, job_listings(title), organisations(name)'
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

  if (notify) {
    const body = opts.messageBody.trim();
    const { error: insErr } = await supabase.from('job_application_messages').insert({
      org_id: orgId,
      job_application_id: id,
      body,
      created_by: user.id,
    });
    if (insErr) {
      return { ok: false, error: insErr.message ?? 'Stage updated but message was not saved.' };
    }

    await sendApplicationStageEmail({
      candidateEmail: app.candidate_email as string,
      candidateName: (app.candidate_name as string)?.trim() || 'there',
      orgName,
      jobTitle,
      stage: newStage,
      messageBody: body,
      portalToken: app.portal_token as string,
    });
  }

  revalidatePath(`/admin/jobs/${opts.jobListingId}/applications`);
  revalidatePath('/admin/applications');
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

  const { supabase, profile, orgId, user } = await requireOrgAdmin();
  if (!profile || !orgId || !user) return { ok: false, error: 'Not allowed.' };

  const { error } = await supabase.from('job_application_notes').insert({
    org_id: orgId,
    job_application_id: id,
    body: text,
    created_by: user.id,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/jobs/${jobListingId}/applications`);
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

  const { supabase, profile, orgId, user } = await requireOrgAdmin();
  if (!profile || !orgId || !user) return { ok: false, error: 'Not allowed.' };

  const { data: app, error: fetchErr } = await supabase
    .from('job_applications')
    .select(
      'candidate_email, candidate_name, portal_token, stage, job_listings(title), organisations(name)'
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

  await sendApplicationStageEmail({
    candidateEmail: app.candidate_email as string,
    candidateName: (app.candidate_name as string)?.trim() || 'there',
    orgName,
    jobTitle,
    stage: (app.stage as string) ?? 'applied',
    messageBody: text,
    portalToken: app.portal_token as string,
  });

  revalidatePath(`/admin/jobs/${jobListingId}/applications`);
  revalidatePath('/admin/applications');
  return { ok: true };
}

export type JobApplicationDetail = {
  application: {
    id: string;
    candidate_name: string;
    candidate_email: string;
    candidate_phone: string | null;
    stage: string;
    submitted_at: string;
    cv_storage_path: string | null;
    loom_url: string | null;
    staffsavvy_score: number | null;
    portal_token: string;
    offer_letter_status: string | null;
    job_listings: { title: string } | null;
  };
  latest_offer: {
    id: string;
    status: string;
    portal_token: string;
    signed_pdf_storage_path: string | null;
  } | null;
  notes: Array<{ id: string; body: string; created_at: string; created_by: string }>;
  messages: Array<{ id: string; body: string; created_at: string; created_by: string }>;
};

export async function loadJobApplicationDetail(
  applicationId: string,
  jobListingId: string
): Promise<JobApplicationDetail | { error: string }> {
  const id = applicationId?.trim();
  if (!id) return { error: 'Missing application.' };

  const { supabase, profile, orgId } = await requireOrgAdmin();
  if (!profile || !orgId) return { error: 'Not allowed.' };

  const { data: application, error: appErr } = await supabase
    .from('job_applications')
    .select(
      `
      id,
      candidate_name,
      candidate_email,
      candidate_phone,
      stage,
      submitted_at,
      cv_storage_path,
      loom_url,
      staffsavvy_score,
      portal_token,
      offer_letter_status,
      job_listings ( title )
    `
    )
    .eq('id', id)
    .eq('org_id', orgId)
    .eq('job_listing_id', jobListingId)
    .maybeSingle();

  if (appErr || !application) return { error: 'Application not found.' };

  const [{ data: notes }, { data: messages }] = await Promise.all([
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
  ]);

  const raw = application as Record<string, unknown>;
  const jl = relationOne(raw.job_listings as { title: string } | { title: string }[] | null);

  const normalized: JobApplicationDetail['application'] = {
    id: String(raw.id),
    candidate_name: String(raw.candidate_name),
    candidate_email: String(raw.candidate_email),
    candidate_phone: (raw.candidate_phone as string | null) ?? null,
    stage: String(raw.stage),
    submitted_at: String(raw.submitted_at),
    cv_storage_path: (raw.cv_storage_path as string | null) ?? null,
    loom_url: (raw.loom_url as string | null) ?? null,
    staffsavvy_score: (raw.staffsavvy_score as number | null) ?? null,
    portal_token: String(raw.portal_token),
    offer_letter_status: (raw.offer_letter_status as string | null) ?? null,
    job_listings: jl ? { title: String(jl.title) } : null,
  };

  const { data: offerRow } = await supabase
    .from('application_offers')
    .select('id, status, portal_token, signed_pdf_storage_path')
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
      portal_token: offerRow.portal_token as string,
      signed_pdf_storage_path: (offerRow.signed_pdf_storage_path as string | null) ?? null,
    };
  }

  return {
    application: normalized,
    latest_offer: latestOffer,
    notes: notes ?? [],
    messages: messages ?? [],
  };
}
