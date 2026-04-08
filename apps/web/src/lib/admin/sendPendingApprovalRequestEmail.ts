import { createServiceRoleClient } from '@/lib/supabase/service-role';

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

type PendingApprovalEmailPayload = {
  profileId: string;
  orgId: string;
  requesterName: string;
  requesterEmail: string | null;
};

/**
 * Sends a single approval-request email fanout per pending profile.
 * Uses a DB dedupe table so refreshes/retries do not spam approvers.
 */
export async function sendPendingApprovalRequestEmail(
  payload: PendingApprovalEmailPayload
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  if (!apiKey || !from) return;

  let admin: ReturnType<typeof createServiceRoleClient>;
  try {
    admin = createServiceRoleClient();
  } catch {
    return;
  }

  const { data: lockRow, error: lockErr } = await admin
    .from('pending_profile_notification_emails')
    .insert({ profile_id: payload.profileId, org_id: payload.orgId })
    .select('profile_id')
    .maybeSingle();
  if (lockErr || !lockRow) return;

  const { data: orgRow } = await admin
    .from('organisations')
    .select('name')
    .eq('id', payload.orgId)
    .maybeSingle();
  const orgName = (orgRow?.name as string | undefined)?.trim() || 'Your organisation';

  const { data: activeProfiles } = await admin
    .from('profiles')
    .select('id,email')
    .eq('org_id', payload.orgId)
    .eq('status', 'active');
  const rows = (activeProfiles ?? []) as Array<{ id: string; email: string | null }>;
  const checks = await Promise.all(
    rows.map(async (r) => {
      const { data: canReview } = await admin.rpc('has_permission', {
        p_user_id: r.id,
        p_org_id: payload.orgId,
        p_permission_key: 'approvals.members.review',
        p_context: {},
      });
      return canReview ? r.email?.trim() ?? null : null;
    })
  );
  const to = [...new Set(checks.filter((email): email is string => Boolean(email)))];

  if (!to.length) return;

  const site = trimBaseUrl(process.env.SITE_URL) ?? trimBaseUrl(process.env.NEXT_PUBLIC_SITE_URL);
  const reviewPath = '/admin/pending';
  const reviewUrl = site ? `${site}${reviewPath}` : reviewPath;
  const subject = `[${orgName}] New member approval request`;
  const safeName = payload.requesterName.trim() || 'New member';
  const safeEmail = payload.requesterEmail?.trim() || 'No email on file';
  const html = `
<p>A new self-registration request is awaiting approval.</p>
<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
  <tr><td style="padding:6px 12px 6px 0;font-weight:600;">Name</td><td>${escapeHtml(safeName)}</td></tr>
  <tr><td style="padding:6px 12px 6px 0;font-weight:600;">Email</td><td>${escapeHtml(safeEmail)}</td></tr>
</table>
<p><a href="${escapeHtml(reviewUrl)}">Review pending approvals</a></p>
  `.trim();

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('[pending-approval] Resend error', res.status, errText);
  }
}
