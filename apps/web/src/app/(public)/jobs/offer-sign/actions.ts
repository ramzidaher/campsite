'use server';

import { buildSignedOfferPdfBytes } from '@/lib/offers/buildSignedOfferPdf';
import { htmlToPlainTextForPdf } from '@/lib/offers/mergeOfferTemplate';
import { sendSignedOfferPdfEmail } from '@/lib/recruitment/sendOfferLetterEmails';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { revalidatePath } from 'next/cache';
import { createHash } from 'crypto';
import { headers } from 'next/headers';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function submitOfferSignature(
  token: string,
  opts: { decline: boolean; typedName?: string; signatureDataUrl?: string | null }
): Promise<{ ok: boolean; error?: string }> {
  const t = token?.trim();
  if (!t) return { ok: false, error: 'Invalid link.' };
  const tokenHash = createHash('sha256').update(t).digest('hex');

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch {
    return { ok: false, error: 'Server misconfigured.' };
  }
  const h = await headers();
  const actorKey = `${(h.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'anon'}:offer-sign-submit`;
  const { data: rateAllowed } = await admin.rpc('record_public_token_attempt', {
    p_channel: 'offer_sign_submit',
    p_actor_key: actorKey,
  });
  if (!rateAllowed) return { ok: false, error: 'Too many attempts. Please retry shortly.' };

  const { data: row, error } = await admin
    .from('application_offers')
    .select('id, org_id, status, job_application_id, body_html, portal_token_expires_at, portal_token_revoked_at')
    .eq('portal_token_hash', tokenHash)
    .maybeSingle();

  if (error || !row) return { ok: false, error: 'Offer not found.' };
  if (row.portal_token_revoked_at) return { ok: false, error: 'This offer link is no longer valid.' };
  if (row.portal_token_expires_at && new Date(row.portal_token_expires_at as string).getTime() <= Date.now()) {
    return { ok: false, error: 'This offer link has expired.' };
  }
  if ((row.status as string) !== 'sent') {
    return { ok: false, error: 'This offer is no longer open for signing.' };
  }

  const appId = row.job_application_id as string;
  const orgId = row.org_id as string;
  const offerId = row.id as string;

  const { data: ja } = await admin
    .from('job_applications')
    .select('id, candidate_name, candidate_email, job_listing_id')
    .eq('id', appId)
    .maybeSingle();

  if (!ja) return { ok: false, error: 'Application not found.' };

  const listingId = (ja.job_listing_id as string) ?? '';

  const [{ data: jl }, { data: orgRow }] = await Promise.all([
    admin.from('job_listings').select('title').eq('id', listingId).maybeSingle(),
    admin.from('organisations').select('name').eq('id', orgId).maybeSingle(),
  ]);

  if (opts.decline) {
    const { error: d1 } = await admin
      .from('application_offers')
      .update({
        status: 'declined',
        declined_at: new Date().toISOString(),
        portal_token: null,
        portal_token_hash: null,
        portal_token_revoked_at: new Date().toISOString(),
        portal_token_last_used_at: new Date().toISOString(),
        portal_token_use_count: 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', offerId);

    if (d1) return { ok: false, error: d1.message };

    const { error: d2 } = await admin
      .from('job_applications')
      .update({ offer_letter_status: 'declined' })
      .eq('id', appId);

    if (d2) return { ok: false, error: d2.message };

    if (listingId) {
      revalidatePath(`/admin/jobs/${listingId}/applications`);
      revalidatePath(`/hr/jobs/${listingId}/applications`);
    }
    return { ok: true };
  }

  const typed = opts.typedName?.trim();
  if (!typed) return { ok: false, error: 'Type your full name to sign.' };

  let signaturePath: string | null = null;
  let sigBytes: Uint8Array | null = null;
  const dataUrl = opts.signatureDataUrl?.trim();
  if (dataUrl?.startsWith('data:image/png;base64,')) {
    try {
      const b64 = dataUrl.split(',')[1];
      const buf = Buffer.from(b64, 'base64');
      sigBytes = new Uint8Array(buf);
      signaturePath = `${orgId}/${appId}/${offerId}_signature.png`;
      await admin.storage.from('application-signed-offers').upload(signaturePath, buf, {
        contentType: 'image/png',
        upsert: true,
      });
    } catch {
      signaturePath = null;
      sigBytes = null;
    }
  }

  const bodyHtml = (row.body_html as string) ?? '';
  const plain = htmlToPlainTextForPdf(bodyHtml);
  const jobTitle = (jl?.title as string | undefined)?.trim() || 'Role';
  const orgName = (orgRow?.name as string | undefined)?.trim() || 'Organisation';
  const candName = (ja.candidate_name as string)?.trim() || 'Candidate';
  const candEmail = (ja.candidate_email as string)?.trim() || '';

  const signedAt = new Date();
  const pdfBytes = await buildSignedOfferPdfBytes({
    letterPlainText: plain,
    orgName,
    jobTitle,
    candidateName: candName,
    signerName: typed,
    signedAt,
    signaturePngBytes: sigBytes,
  });

  const pdfPath = `${orgId}/${appId}/${offerId}_signed.pdf`;
  await admin.storage.from('application-signed-offers').upload(pdfPath, pdfBytes, {
    contentType: 'application/pdf',
    upsert: true,
  });

  const { error: u1 } = await admin
    .from('application_offers')
    .update({
      status: 'signed',
      signer_typed_name: typed,
      signature_storage_path: signaturePath,
      signed_pdf_storage_path: pdfPath,
      signed_at: signedAt.toISOString(),
      portal_token: null,
      portal_token_hash: null,
      portal_token_revoked_at: new Date().toISOString(),
      portal_token_last_used_at: new Date().toISOString(),
      portal_token_use_count: 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', offerId);

  if (u1) return { ok: false, error: u1.message };

  const { error: u2 } = await admin
    .from('job_applications')
    .update({ offer_letter_status: 'signed' })
    .eq('id', appId);

  if (u2) return { ok: false, error: u2.message };

  // Keep a first-class contract assignment row and initialize readiness.
  const { data: hrRecord } = await admin
    .from('employee_hr_records')
    .select('user_id')
    .eq('org_id', orgId)
    .eq('hired_from_application_id', appId)
    .maybeSingle();

  await admin
    .from('recruitment_contract_assignments')
    .upsert(
      {
        org_id: orgId,
        job_application_id: appId,
        application_offer_id: offerId,
        assigned_to_user_id: (hrRecord?.user_id as string | null) ?? null,
        contract_signed_on: signedAt.toISOString(),
        contract_document_url: pdfPath,
        assigned_by: null,
      },
      { onConflict: 'job_application_id' }
    );

  await admin
    .from('hiring_start_readiness')
    .upsert(
      {
        org_id: orgId,
        job_application_id: appId,
        offer_id: offerId,
        contract_assigned: true,
      },
      { onConflict: 'job_application_id' }
    );

  const { data: members } = await admin
    .from('profiles')
    .select('id, email')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .not('email', 'is', null);

  const checks = await Promise.all(
    (members ?? []).map(async (m) => {
      const { data } = await admin.rpc('has_permission', {
        p_user_id: m.id,
        p_org_id: orgId,
        p_permission_key: 'offers.view',
        p_context: {},
      });
      return { email: (m.email as string | null)?.trim() ?? '', allowed: Boolean(data) };
    }),
  );

  const adminEmails = checks
    .filter((r) => r.allowed)
    .map((r) => r.email)
    .filter((e): e is string => Boolean(e));

  const pdfBase64 = Buffer.from(pdfBytes).toString('base64');
  const subject = `${orgName}: Signed offer — ${jobTitle}`;
  const htmlBody = `
<p>The offer letter for <strong>${escapeHtml(candName)}</strong> (${escapeHtml(candEmail)}) — <strong>${escapeHtml(jobTitle)}</strong> — has been signed electronically.</p>
<p>Signed by: ${escapeHtml(typed)}</p>
`.trim();

  const allTo = [candEmail, ...adminEmails.filter((e) => e !== candEmail)];
  await sendSignedOfferPdfEmail({
    to: allTo,
    subject,
    htmlBody,
    pdfBase64,
    filename: `signed-offer-${offerId.slice(0, 8)}.pdf`,
  });

  if (listingId) {
    revalidatePath(`/admin/jobs/${listingId}/applications`);
    revalidatePath(`/hr/jobs/${listingId}/applications`);
  }
  revalidatePath('/admin/applications');
  revalidatePath('/hr/applications');
  return { ok: true };
}
