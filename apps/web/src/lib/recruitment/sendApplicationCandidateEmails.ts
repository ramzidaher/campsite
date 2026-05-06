import { publicRequestOrigin } from '@/lib/http/publicRequestOrigin';
import { jobApplicationStageLabel } from '@/lib/jobs/labels';

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

export type ApplicationSubmittedEmailPayload = {
  candidateEmail: string;
  candidateName: string;
  orgName: string;
  jobTitle: string;
  portalToken: string;
};

/**
 * Confirmation after apply; includes magic portal link. Skips when Resend is not configured.
 */
export async function sendApplicationSubmittedEmail(payload: ApplicationSubmittedEmailPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  if (!apiKey || !from) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        '[applications] Skipping confirmation email: set RESEND_API_KEY and RESEND_FROM.'
      );
   }
    return;
  }

  const origin =
    trimBaseUrl(process.env.SITE_URL) ?? trimBaseUrl(process.env.NEXT_PUBLIC_SITE_URL);
  let base = origin ?? (await publicRequestOrigin());
  if (!base) base = '';
  const portalPath = `/jobs/status/${encodeURIComponent(payload.portalToken)}`;
  const portalUrl = base ? `${base.replace(/\/+$/, '')}${portalPath}` : portalPath;

  const subject = `${payload.orgName}: Application received  ${payload.jobTitle}`;
  const html = `
<p>Hi ${escapeHtml(payload.candidateName)},</p>
<p>Thanks for applying for <strong>${escapeHtml(payload.jobTitle)}</strong> at ${escapeHtml(payload.orgName)}.</p>
<p>You can track your application status and any updates from us here:</p>
<p><a href="${escapeHtml(portalUrl)}">View your application</a></p>
<p>If the button does not work, copy this link: ${escapeHtml(portalUrl)}</p>
`.trim();

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [payload.candidateEmail.trim()],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('[applications] Resend confirmation error', res.status, errText);
  }
}

export type ApplicationStageEmailPayload = {
  candidateEmail: string;
  candidateName: string;
  orgName: string;
  jobTitle: string;
  stage: string;
  messageBody: string;
  portalToken: string;
};

export async function sendApplicationStageEmail(payload: ApplicationStageEmailPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  if (!apiKey || !from) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[applications] Skipping stage email: set RESEND_API_KEY and RESEND_FROM.');
    }
    return;
  }

  const origin =
    trimBaseUrl(process.env.SITE_URL) ?? trimBaseUrl(process.env.NEXT_PUBLIC_SITE_URL);
  let base = origin ?? (await publicRequestOrigin());
  if (!base) base = '';
  const portalPath = `/jobs/status/${encodeURIComponent(payload.portalToken)}`;
  const portalUrl = base ? `${base.replace(/\/+$/, '')}${portalPath}` : portalPath;

  const stageLabel = jobApplicationStageLabel(payload.stage);
  const subject = `${payload.orgName}: Update on your application  ${payload.jobTitle}`;
  const safeMsg = escapeHtml(payload.messageBody.trim()).replace(/\n/g, '<br/>');
  const html = `
<p>Hi ${escapeHtml(payload.candidateName)},</p>
<p><strong>Status:</strong> ${escapeHtml(stageLabel)}</p>
<div style="white-space:pre-wrap;">${safeMsg}</div>
<p><a href="${escapeHtml(portalUrl)}">View your application portal</a></p>
`.trim();

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [payload.candidateEmail.trim()],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('[applications] Resend stage email error', res.status, errText);
  }
}
