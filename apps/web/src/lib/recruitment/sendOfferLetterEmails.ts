import { publicRequestOrigin } from '@/lib/http/publicRequestOrigin';

function trimBaseUrl(url: string | undefined): string | null {
  if (!url?.trim()) return null;
  return url.replace(/\/+$/, '') || null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sendOfferLetterSigningEmail(opts: {
  candidateEmail: string;
  candidateName: string;
  orgName: string;
  jobTitle: string;
  portalToken: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  if (!apiKey || !from) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[offers] Skipping offer email: set RESEND_API_KEY and RESEND_FROM.');
    }
    return;
  }

  const origin = trimBaseUrl(process.env.SITE_URL) ?? trimBaseUrl(process.env.NEXT_PUBLIC_SITE_URL);
  let base = origin ?? (await publicRequestOrigin());
  if (!base) base = '';
  const path = `/jobs/offer-sign/${encodeURIComponent(opts.portalToken)}`;
  const signUrl = base ? `${base.replace(/\/+$/, '')}${path}` : path;

  const subject = `${opts.orgName}: Your offer letter  please review and sign`;
  const html = `
<p>Hi ${escapeHtml(opts.candidateName)},</p>
<p>Please review and sign your formal offer for <strong>${escapeHtml(opts.jobTitle)}</strong> at ${escapeHtml(opts.orgName)}.</p>
<p><a href="${escapeHtml(signUrl)}">Open your offer letter</a></p>
<p>If the link doesn&apos;t work, copy this URL: ${escapeHtml(signUrl)}</p>
`.trim();

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [opts.candidateEmail.trim()], subject, html }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    console.error('[offers] Resend signing email', res.status, t);
  }
}

export async function sendSignedOfferPdfEmail(opts: {
  to: string[];
  subject: string;
  htmlBody: string;
  pdfBase64: string;
  filename: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  if (!apiKey || !from || !opts.to.length) return;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.htmlBody,
      attachments: [{ filename: opts.filename, content: opts.pdfBase64 }],
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    console.error('[offers] Resend PDF email', res.status, t);
  }
}
