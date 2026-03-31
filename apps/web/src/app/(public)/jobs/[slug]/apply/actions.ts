'use server';

import {
  sendApplicationSubmittedEmail,
} from '@/lib/recruitment/sendApplicationCandidateEmails';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { headers } from 'next/headers';

export type SubmitJobApplicationState =
  | { ok: true; message: string }
  | { ok: false; error: string };

type PublicListingRow = {
  job_listing_id: string;
  org_name: string;
  title: string;
  allow_cv: boolean;
  allow_loom: boolean;
  allow_staffsavvy: boolean;
  application_mode: string;
};

function sanitizeFilename(name: string): string {
  const base = name.replace(/^.*[/\\]/, '').replace(/[^a-zA-Z0-9._-]/g, '_');
  return base.slice(0, 120) || 'cv.pdf';
}

export async function submitPublicJobApplication(
  _prev: SubmitJobApplicationState | undefined,
  formData: FormData
): Promise<SubmitJobApplicationState> {
  const h = await headers();
  const orgSlug = h.get('x-campsite-org-slug')?.trim();
  if (!orgSlug) return { ok: false, error: 'This page must be opened from your organisation site.' };

  const jobSlug = String(formData.get('job_slug') ?? '').trim();
  if (!jobSlug) return { ok: false, error: 'Missing job.' };

  const name = String(formData.get('candidate_name') ?? '').trim();
  const email = String(formData.get('candidate_email') ?? '').trim();
  const phone = String(formData.get('candidate_phone') ?? '').trim();
  const loomRaw = String(formData.get('loom_url') ?? '').trim();
  const scoreRaw = String(formData.get('staffsavvy_score') ?? '').trim();
  const cvFile = formData.get('cv');

  if (!name) return { ok: false, error: 'Please enter your name.' };
  if (!email) return { ok: false, error: 'Please enter your email.' };

  const supabase = await createClient();
  const { data: listingRows, error: listingErr } = await supabase.rpc('public_job_listing_by_slug', {
    p_org_slug: orgSlug,
    p_job_slug: jobSlug,
  });

  if (listingErr || !listingRows?.length) {
    return { ok: false, error: 'This job is not accepting applications.' };
  }

  const listing = listingRows[0] as PublicListingRow;
  const hasCvFile = cvFile instanceof File && cvFile.size > 0;
  const expectCvUpload = Boolean(listing.allow_cv && hasCvFile);

  let staffsavvyScore: number | null = null;
  if (scoreRaw) {
    const n = Number.parseInt(scoreRaw, 10);
    if (Number.isNaN(n) || n < 1 || n > 5) {
      return { ok: false, error: 'StaffSavvy score must be between 1 and 5.' };
    }
    staffsavvyScore = n;
  }

  const { data: submitRows, error: submitErr } = await supabase.rpc('submit_job_application', {
    p_org_slug: orgSlug,
    p_job_slug: jobSlug,
    p_candidate_name: name,
    p_candidate_email: email,
    p_candidate_phone: phone || null,
    p_cv_storage_path: null,
    p_loom_url: loomRaw || null,
    p_staffsavvy_score: staffsavvyScore,
    p_expect_cv_upload: expectCvUpload,
  });

  if (submitErr || !submitRows?.length) {
    const msg = submitErr?.message ?? 'Could not submit application.';
    if (/already applied/i.test(msg)) {
      return { ok: false, error: 'You have already applied for this role.' };
    }
    return { ok: false, error: msg };
  }

  const row = submitRows[0] as { application_id: string; portal_token: string };
  const applicationId = row.application_id;
  const portalToken = row.portal_token;

  if (expectCvUpload && hasCvFile && cvFile instanceof File) {
    try {
      const admin = createServiceRoleClient();
      const { data: appRow } = await admin
        .from('job_applications')
        .select('org_id')
        .eq('id', applicationId)
        .maybeSingle();
      const orgId = appRow?.org_id as string | undefined;
      if (orgId) {
        const buf = Buffer.from(await cvFile.arrayBuffer());
        const safe = sanitizeFilename(cvFile.name);
        const path = `${orgId}/${applicationId}/${safe}`;
        const { error: upErr } = await admin.storage.from('job-application-cvs').upload(path, buf, {
          contentType: cvFile.type || 'application/pdf',
          upsert: false,
        });
        if (!upErr) {
          await admin.from('job_applications').update({ cv_storage_path: path }).eq('id', applicationId);
        }
      }
    } catch (e) {
      console.error('[applications] CV upload failed', e);
    }
  }

  await sendApplicationSubmittedEmail({
    candidateEmail: email,
    candidateName: name,
    orgName: listing.org_name,
    jobTitle: listing.title,
    portalToken,
  });

  return {
    ok: true,
    message: `Thanks for applying. We've emailed you a private link to track your application and any updates.`,
  };
}
