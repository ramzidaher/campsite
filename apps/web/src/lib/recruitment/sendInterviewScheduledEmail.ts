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

export type InterviewScheduledEmailPayload = {
  candidateEmail: string;
  candidateName: string;
  orgName: string;
  jobTitle: string;
  startsAtLabel: string;
  endsAtLabel: string;
  joiningInstructions: string;
  portalToken: string;
};

export async function sendInterviewScheduledEmail(payload: InterviewScheduledEmailPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  if (!apiKey || !from) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[interviews] Skipping interview email: set RESEND_API_KEY and RESEND_FROM.');
    }
    return;
  }

  const origin = trimBaseUrl(process.env.SITE_URL) ?? trimBaseUrl(process.env.NEXT_PUBLIC_SITE_URL);
  let base = origin ?? (await publicRequestOrigin());
  if (!base) base = '';
  const portalPath = `/jobs/status/${encodeURIComponent(payload.portalToken)}`;
  const portalUrl = base ? `${base.replace(/\/+$/, '')}${portalPath}` : portalPath;

  const subject = `${payload.orgName}: Interview scheduled  ${payload.jobTitle}`;
  const instr = payload.joiningInstructions.trim()
    ? `<p style="font-weight:600;">Joining details</p><p style="white-space:pre-wrap;">${escapeHtml(payload.joiningInstructions.trim())}</p>`
    : '';

  const html = `
<p>Hi ${escapeHtml(payload.candidateName)},</p>
<p>Your interview for <strong>${escapeHtml(payload.jobTitle)}</strong> is scheduled:</p>
<ul>
  <li><strong>Start:</strong> ${escapeHtml(payload.startsAtLabel)}</li>
  <li><strong>End:</strong> ${escapeHtml(payload.endsAtLabel)}</li>
</ul>
${instr}
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
    console.error('[interviews] Resend error', res.status, errText);
  }
}
