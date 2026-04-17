import { createServiceRoleClient } from '@/lib/supabase/service-role';
import type { RecruitmentContractType, RecruitmentHireReason, RecruitmentUrgency } from '@campsite/types';

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

const REASON_LABEL: Record<RecruitmentHireReason, string> = {
  new_role: 'New role',
  backfill: 'Backfill',
};

const CONTRACT_LABEL: Record<RecruitmentContractType, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  seasonal: 'Seasonal',
};

const URGENCY_LABEL: Record<RecruitmentUrgency, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
};

export type RecruitmentRequestEmailPayload = {
  orgId: string;
  requestId: string;
  departmentName: string;
  submitterName: string;
  jobTitle: string;
  gradeLevel: string;
  salaryBand: string;
  reasonForHire: RecruitmentHireReason;
  startDateNeeded: string;
  contractType: RecruitmentContractType;
  idealCandidateProfile: string;
  specificRequirements: string | null;
  urgency: RecruitmentUrgency;
};

/**
 * Notifies org admins by email when a manager submits a recruitment request.
 * Skips silently when RESEND_API_KEY or service role / from address is not configured.
 */
export async function sendRecruitmentRequestHrEmail(payload: RecruitmentRequestEmailPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  if (!apiKey || !from) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        '[recruitment] Skipping HR email: set RESEND_API_KEY and RESEND_FROM (e.g. onboarding@yourdomain.com).'
      );
    }
    return;
  }

  let admin: ReturnType<typeof createServiceRoleClient>;
  try {
    admin = createServiceRoleClient();
  } catch {
    return;
  }

  const { data: members } = await admin
    .from('profiles')
    .select('id, email')
    .eq('org_id', payload.orgId)
    .eq('status', 'active')
    .not('email', 'is', null);

  const checks = await Promise.all(
    (members ?? []).map(async (m) => {
      const { data } = await admin.rpc('has_permission', {
        p_user_id: m.id,
        p_org_id: payload.orgId,
        p_permission_key: 'recruitment.approve_request',
        p_context: {},
      });
      return { email: (m.email as string | null)?.trim() ?? '', allowed: Boolean(data) };
    }),
  );

  const to = checks
    .filter((r) => r.allowed)
    .map((r) => r.email)
    .filter((e): e is string => Boolean(e));

  if (!to.length) return;

  const { data: orgRow } = await admin.from('organisations').select('name').eq('id', payload.orgId).maybeSingle();
  const orgName = (orgRow?.name as string | undefined)?.trim() || 'Your organisation';

  const site = trimBaseUrl(process.env.SITE_URL) ?? trimBaseUrl(process.env.NEXT_PUBLIC_SITE_URL);
  const reviewPath = '/hr/hiring/requests';
  const reviewUrl = site ? `${site}${reviewPath}` : reviewPath;

  const subject = `[${orgName}] New recruitment request: ${payload.jobTitle}`;

  const specifics = payload.specificRequirements?.trim()
    ? escapeHtml(payload.specificRequirements.trim())
    : '—';

  const html = `
<p>A department manager submitted a new recruitment request.</p>
<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
  <tr><td style="padding:6px 12px 6px 0;font-weight:600;">Job title</td><td>${escapeHtml(payload.jobTitle)}</td></tr>
  <tr><td style="padding:6px 12px 6px 0;font-weight:600;">Department</td><td>${escapeHtml(payload.departmentName)}</td></tr>
  <tr><td style="padding:6px 12px 6px 0;font-weight:600;">Submitted by</td><td>${escapeHtml(payload.submitterName)}</td></tr>
  <tr><td style="padding:6px 12px 6px 0;font-weight:600;">Urgency</td><td>${escapeHtml(URGENCY_LABEL[payload.urgency])}</td></tr>
  <tr><td style="padding:6px 12px 6px 0;font-weight:600;">Grade / level</td><td>${escapeHtml(payload.gradeLevel)}</td></tr>
  <tr><td style="padding:6px 12px 6px 0;font-weight:600;">Salary band</td><td>${escapeHtml(payload.salaryBand)}</td></tr>
  <tr><td style="padding:6px 12px 6px 0;font-weight:600;">Reason</td><td>${escapeHtml(REASON_LABEL[payload.reasonForHire])}</td></tr>
  <tr><td style="padding:6px 12px 6px 0;font-weight:600;">Start date needed</td><td>${escapeHtml(payload.startDateNeeded)}</td></tr>
  <tr><td style="padding:6px 12px 6px 0;font-weight:600;">Contract</td><td>${escapeHtml(CONTRACT_LABEL[payload.contractType])}</td></tr>
</table>
<p style="font-weight:600;margin-top:16px;">Ideal candidate</p>
<p style="white-space:pre-wrap;">${escapeHtml(payload.idealCandidateProfile)}</p>
<p style="font-weight:600;margin-top:16px;">Specific requirements</p>
<p style="white-space:pre-wrap;">${specifics}</p>
<p><a href="${escapeHtml(reviewUrl)}">Review in CampSite</a></p>
`.trim();

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('[recruitment] Resend error', res.status, errText);
  }
}
