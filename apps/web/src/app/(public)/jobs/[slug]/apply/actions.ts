'use server';

import {
  invalidateAdminApplicationsForOrg,
  invalidateHrOverviewForOrg,
} from '@/lib/cache/cacheInvalidation';
import {
  sendApplicationSubmittedEmail,
} from '@/lib/recruitment/sendApplicationCandidateEmails';
import { cvUploadValidationMessage } from '@/lib/recruitment/cvUploadConstraints';
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
  allow_application_questions?: boolean;
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
  const location = String(formData.get('candidate_location') ?? '').trim();
  const currentTitle = String(formData.get('current_title') ?? '').trim();
  const linkedInUrl = String(formData.get('linkedin_url') ?? '').trim();
  const portfolioUrl = String(formData.get('portfolio_url') ?? '').trim();
  const motivationText = String(formData.get('motivation_text') ?? '').trim();
  const coverLetter = String(formData.get('cover_letter') ?? '').trim();
  const eqRaw = String(formData.get('eq_ethnicity') ?? '').trim();
  const cvFile = formData.get('cv');

  let pEqEthnicityCode: string | null = null;
  let pEqualityMonitoringDeclined = false;
  if (eqRaw === '__declined__') {
    pEqualityMonitoringDeclined = true;
  } else if (eqRaw) {
    pEqEthnicityCode = eqRaw;
  }

  if (!name) return { ok: false, error: 'Please enter your name.' };
  if (!email) return { ok: false, error: 'Please enter your email.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const candidateUserId = user?.id ?? null;
  if (user?.email && email.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
    return { ok: false, error: 'Use the same email address as your signed-in account, or sign out to apply as a guest.' };
  }
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

  if (hasCvFile && cvFile instanceof File) {
    const cvErr = cvUploadValidationMessage(cvFile.name, cvFile.size, cvFile.type || '');
    if (cvErr) {
      return { ok: false, error: cvErr };
    }
  }

  let staffsavvyScore: number | null = null;
  if (scoreRaw) {
    const n = Number.parseInt(scoreRaw, 10);
    if (Number.isNaN(n) || n < 1 || n > 5) {
      return { ok: false, error: 'StaffSavvy score must be between 1 and 5.' };
    }
    staffsavvyScore = n;
  }

  const screeningRaw = String(formData.get('screening_answers_json') ?? '').trim();
  let pScreening: unknown = [];
  if (screeningRaw) {
    try {
      pScreening = JSON.parse(screeningRaw) as unknown;
    } catch {
      return { ok: false, error: 'Could not read application question answers.' };
    }
  }
  if (!Array.isArray(pScreening)) {
    return { ok: false, error: 'Invalid application question answers.' };
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
    p_candidate_location: location || null,
    p_current_title: currentTitle || null,
    p_linkedin_url: linkedInUrl || null,
    p_portfolio_url: portfolioUrl || null,
    p_motivation_text: motivationText || null,
    p_cover_letter: coverLetter || null,
    p_eq_ethnicity_code: pEqEthnicityCode,
    p_equality_monitoring_declined: pEqualityMonitoringDeclined,
    p_screening_answers: pScreening,
  });

  if (submitErr || !submitRows?.length) {
    const msg = submitErr?.message ?? 'Could not submit application.';
    if (/already applied/i.test(msg)) {
      return { ok: false, error: 'You have already applied for this role.' };
    }
    return { ok: false, error: msg };
  }

  if (candidateUserId) {
    await supabase.from('candidate_profiles').upsert(
      {
        id: candidateUserId,
        full_name: name || null,
        phone: phone || null,
        location: location || null,
        linkedin_url: linkedInUrl || null,
        portfolio_url: portfolioUrl || null,
      },
      { onConflict: 'id' }
    );
  }

  await supabase.rpc('track_public_job_metric', {
    p_org_slug: orgSlug,
    p_job_slug: jobSlug,
    p_event_type: 'apply_submit',
  });

  const row = submitRows[0] as { application_id: string; portal_token: string };
  const applicationId = row.application_id;
  const portalToken = row.portal_token;
  let applicationOrgId: string | null = null;

  let cvUploadWarning: string | null = null;

  try {
    const admin = createServiceRoleClient();
    const { data: appRow } = await admin
      .from('job_applications')
      .select('org_id')
      .eq('id', applicationId)
      .maybeSingle();
    applicationOrgId = (appRow?.org_id as string | undefined) ?? null;
  } catch {
    applicationOrgId = null;
  }

  if (expectCvUpload && hasCvFile && cvFile instanceof File) {
    try {
      const admin = createServiceRoleClient();
      const orgId = applicationOrgId ?? undefined;
      if (!orgId) {
        cvUploadWarning =
          'Your application was saved, but we could not attach your CV automatically. HR may contact you for a copy.';
      } else {
        const buf = Buffer.from(await cvFile.arrayBuffer());
        const safe = sanitizeFilename(cvFile.name);
        const path = `${orgId}/${applicationId}/${safe}`;
        const { error: upErr } = await admin.storage.from('job-application-cvs').upload(path, buf, {
          contentType: cvFile.type || 'application/pdf',
          upsert: false,
        });
        if (!upErr) {
          await admin.from('job_applications').update({ cv_storage_path: path }).eq('id', applicationId);
        } else {
          console.error('[applications] CV upload failed', upErr);
          cvUploadWarning =
            'Your application was saved, but the CV upload failed. HR may contact you for a copy of your CV.';
        }
      }
    } catch (e) {
      console.error('[applications] CV upload failed', e);
      cvUploadWarning =
        'Your application was saved, but the CV upload failed. HR may contact you for a copy of your CV.';
    }
  }

  if (applicationOrgId) {
    await Promise.all([
      invalidateAdminApplicationsForOrg(applicationOrgId),
      invalidateHrOverviewForOrg(applicationOrgId),
    ]);
  }

  await sendApplicationSubmittedEmail({
    candidateEmail: email,
    candidateName: name,
    orgName: listing.org_name,
    jobTitle: listing.title,
    portalToken,
  });

  const baseMsg = `Thanks for applying. We've emailed you a private link to track your application and any updates.`;
  return {
    ok: true,
    message: cvUploadWarning ? `${baseMsg} ${cvUploadWarning}` : baseMsg,
  };
}
