'use server';

import { buildSignedOfferPdfBytes } from '@/lib/offers/buildSignedOfferPdf';
import { htmlToPlainTextForPdf } from '@/lib/offers/mergeOfferTemplate';
import { sendSignedOfferPdfEmail } from '@/lib/recruitment/sendOfferLetterEmails';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { revalidatePath } from 'next/cache';

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

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch {
    return { ok: false, error: 'Server misconfigured.' };
  }

  const { data: row, error } = await admin
    .from('application_offers')
    .select('id, org_id, status, job_application_id, body_html')
    .eq('portal_token', t)
    .maybeSingle();

  if (error || !row) return { ok: false, error: 'Offer not found.' };
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
        updated_at: new Date().toISOString(),
      })
      .eq('id', offerId);

    if (d1) return { ok: false, error: d1.message };

    const { error: d2 } = await admin
      .from('job_applications')
      .update({ offer_letter_status: 'declined' })
      .eq('id', appId);

    if (d2) return { ok: false, error: d2.message };

    if (listingId) revalidatePath(`/admin/jobs/${listingId}/applications`);
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
      updated_at: new Date().toISOString(),
    })
    .eq('id', offerId);

  if (u1) return { ok: false, error: u1.message };

  const { error: u2 } = await admin
    .from('job_applications')
    .update({ offer_letter_status: 'signed' })
    .eq('id', appId);

  if (u2) return { ok: false, error: u2.message };

  const { data: admins } = await admin
    .from('profiles')
    .select('email')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .in('role', ['org_admin', 'super_admin']);

  const adminEmails = (admins ?? [])
    .map((r) => (r.email as string | null)?.trim())
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

  if (listingId) revalidatePath(`/admin/jobs/${listingId}/applications`);
  revalidatePath('/admin/applications');
  return { ok: true };
}
