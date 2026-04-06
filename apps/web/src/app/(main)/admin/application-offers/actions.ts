'use server';

import { mergeOfferTemplateHtml } from '@/lib/offers/mergeOfferTemplate';
import { recruitmentContractLabel } from '@/lib/recruitment/labels';
import { sendOfferLetterSigningEmail } from '@/lib/recruitment/sendOfferLetterEmails';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { revalidatePath } from 'next/cache';

function relationOne<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

function newOfferPortalToken(): string {
  const a = crypto.randomUUID().replace(/-/g, '');
  const b = crypto.randomUUID().replace(/-/g, '');
  return `${a}${b}`;
}

async function requireOrgPermission(permissionKey: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null as null, profile: null as null, orgId: null as null };

  const { data: profile } = await supabase.from('profiles').select('id, org_id, status').eq('id', user.id).maybeSingle();
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

export async function previewMergedOfferLetter(args: {
  templateId: string;
  jobApplicationId: string;
  jobListingId: string;
  startDate: string;
  salaryOverride?: string;
}): Promise<{ ok: true; html: string } | { ok: false; error: string }> {
  const { supabase, orgId } = await requireOrgPermission('offers.generate');
  if (!orgId) return { ok: false, error: 'Not allowed.' };

  const tid = args.templateId?.trim();
  const appId = args.jobApplicationId?.trim();
  const jid = args.jobListingId?.trim();
  if (!tid || !appId || !jid) return { ok: false, error: 'Missing data.' };

  const { data: template, error: tErr } = await supabase
    .from('offer_letter_templates')
    .select('body_html')
    .eq('id', tid)
    .eq('org_id', orgId)
    .maybeSingle();
  if (tErr || !template) return { ok: false, error: 'Template not found.' };

  const { data: row, error: aErr } = await supabase
    .from('job_applications')
    .select('candidate_name, job_listings ( salary_band, contract_type, title )')
    .eq('id', appId)
    .eq('org_id', orgId)
    .eq('job_listing_id', jid)
    .maybeSingle();

  if (aErr || !row) return { ok: false, error: 'Application not found.' };

  type JobListingCols = { salary_band?: string; contract_type?: string; title?: string };
  const jl: JobListingCols | null = relationOne(
    (row as { job_listings?: JobListingCols | JobListingCols[] | null }).job_listings
  );
  const salary = args.salaryOverride?.trim() || jl?.salary_band?.trim() || '';
  const contractRaw = jl?.contract_type ?? '';
  const contractLabel = recruitmentContractLabel(contractRaw);
  const start = args.startDate?.trim() || '';

  const html = mergeOfferTemplateHtml((template.body_html as string) ?? '', {
    candidate_name: (row.candidate_name as string)?.trim() ?? '',
    job_title: (jl?.title as string | undefined)?.trim() ?? '',
    salary,
    start_date: start,
    contract_type: contractLabel,
  });

  return { ok: true, html };
}

export async function sendOfferLetterForApplication(args: {
  jobApplicationId: string;
  jobListingId: string;
  templateId: string;
  bodyHtml: string;
  offerStartDate: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, profile, orgId, user } = await requireOrgPermission('offers.send_esign');
  if (!profile || !orgId || !user) return { ok: false, error: 'Not allowed.' };

  const appId = args.jobApplicationId?.trim();
  const jid = args.jobListingId?.trim();
  const tid = args.templateId?.trim();
  const html = args.bodyHtml?.trim();
  if (!appId || !jid || !tid || !html) return { ok: false, error: 'Letter content is required.' };

  const { data: app, error: appErr } = await supabase
    .from('job_applications')
    .select(
      'id, stage, candidate_name, candidate_email, job_listings ( title ), organisations ( name )'
    )
    .eq('id', appId)
    .eq('org_id', orgId)
    .eq('job_listing_id', jid)
    .maybeSingle();

  if (appErr || !app) return { ok: false, error: 'Application not found.' };
  if ((app.stage as string) !== 'offer_sent') {
    return { ok: false, error: 'Move the candidate to Offer sent before sending a letter.' };
  }

  const { data: template, error: tErr } = await supabase
    .from('offer_letter_templates')
    .select('id')
    .eq('id', tid)
    .eq('org_id', orgId)
    .maybeSingle();
  if (tErr || !template) return { ok: false, error: 'Template not found.' };

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch {
    return { ok: false, error: 'Server misconfigured.' };
  }

  await admin
    .from('application_offers')
    .update({ status: 'superseded', updated_at: new Date().toISOString() })
    .eq('job_application_id', appId)
    .eq('org_id', orgId)
    .eq('status', 'sent');

  const portalToken = newOfferPortalToken();

  const { data: inserted, error: insErr } = await admin
    .from('application_offers')
    .insert({
      org_id: orgId,
      job_application_id: appId,
      template_id: tid,
      body_html: html,
      portal_token: portalToken,
      status: 'sent',
      created_by: user.id,
      offer_start_date: args.offerStartDate?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (insErr || !inserted?.id) return { ok: false, error: insErr?.message ?? 'Could not create offer.' };

  const { error: upAppErr } = await admin
    .from('job_applications')
    .update({ offer_letter_status: 'sent' })
    .eq('id', appId)
    .eq('org_id', orgId);

  if (upAppErr) return { ok: false, error: upAppErr.message };

  const jl = relationOne(
    app.job_listings as { title: string } | { title: string }[] | null
  );
  const orgRow = relationOne(app.organisations as { name: string } | { name: string }[] | null);

  await sendOfferLetterSigningEmail({
    candidateEmail: app.candidate_email as string,
    candidateName: (app.candidate_name as string)?.trim() || 'there',
    orgName: orgRow?.name?.trim() || 'Organisation',
    jobTitle: jl?.title?.trim() || 'Role',
    portalToken,
  });

  revalidatePath(`/admin/jobs/${jid}/applications`);
  revalidatePath('/admin/applications');
  revalidatePath(`/hr/jobs/${jid}/applications`);
  revalidatePath('/hr/applications');
  return { ok: true };
}
