import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

/**
 * Drains `calendar_event_notification_jobs`: Expo push + Resend email per target user.
 * Auth: `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` (verify_jwt = false).
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_ATTEMPTS = 5;
const CHUNK = 99;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pushCopy(
  eventType: string,
  title: string,
): { title: string; body: string } {
  const t = title?.trim() || 'Event';
  switch (eventType) {
    case 'invite':
      return { title: 'Calendar', body: `You're invited: ${t}` };
    case 'update':
      return { title: 'Calendar', body: `Updated: ${t}` };
    case 'cancel':
      return { title: 'Calendar', body: `Cancelled: ${t}` };
    default:
      return { title: 'Calendar', body: 'Calendar update.' };
  }
}

function formatWhen(payload: Record<string, unknown>): string {
  const st = payload.start_time as string | undefined;
  if (!st) return '';
  try {
    const d = new Date(st);
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return st;
  }
}

async function sendExpoBatch(
  messages: { to: string; title: string; body: string; sound?: string; data?: Record<string, unknown> }[],
): Promise<{ ok: boolean; error?: string }> {
  if (messages.length === 0) return { ok: true };
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN') ?? '';
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(messages),
  });
  if (!res.ok) {
    const t = await res.text();
    return { ok: false, error: `Expo HTTP ${res.status}: ${t.slice(0, 500)}` };
  }
  const json = (await res.json()) as { data?: { status?: string; message?: string }[]; errors?: unknown };
  const errs = json?.data?.filter((d) => d?.status === 'error') ?? [];
  if (errs.length > 0 && errs.length === messages.length) {
    return { ok: false, error: errs.map((e) => e.message ?? 'error').join('; ').slice(0, 500) };
  }
  return { ok: true };
}

async function sendResendEmails(
  recipients: { email: string; userId: string }[],
  subject: string,
  html: string,
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = Deno.env.get('RESEND_API_KEY')?.trim();
  const from = Deno.env.get('RESEND_FROM')?.trim();
  if (!apiKey || !from || recipients.length === 0) {
    return { ok: true };
  }
  let lastErr: string | undefined;
  for (const r of recipients) {
    const e = r.email?.trim();
    if (!e) continue;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [e],
        subject,
        html,
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      lastErr = `Resend ${res.status}: ${t.slice(0, 200)}`;
    }
  }
  return lastErr ? { ok: false, error: lastErr } : { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const auth = req.headers.get('Authorization') ?? '';

  if (!serviceKey || !url || auth !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(url, serviceKey);

  const limitJobs = Math.min(
    50,
    Math.max(1, Number(new URL(req.url).searchParams.get('limit')) || 20),
  );

  const { data: jobs, error: jobErr } = await supabase.rpc('claim_calendar_event_notification_jobs', {
    p_limit: limitJobs,
    p_lease_seconds: 120,
  });

  if (jobErr) {
    return new Response(JSON.stringify({ error: jobErr.message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const siteBase = (Deno.env.get('SITE_URL') ?? Deno.env.get('NEXT_PUBLIC_SITE_URL') ?? '').replace(/\/+$/, '');

  const results: {
    id: string;
    event_type: string;
    recipient_count: number;
    token_count: number;
    sent: boolean;
    error?: string;
  }[] = [];

  for (const row of jobs ?? []) {
    const id = row.id as string;
    const attempts = (row.attempts as number) ?? 0;
    const eventType = row.event_type as string;
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const targetUserIds = (row.target_user_ids as string[] | null)?.filter(Boolean) ?? [];

    if (attempts >= MAX_ATTEMPTS) {
      await supabase
        .from('calendar_event_notification_jobs')
        .update({
          processed_at: new Date().toISOString(),
          attempts: attempts + 1,
          last_error: 'max_attempts_exceeded',
          claimed_at: null,
          claim_expires_at: null,
        })
        .eq('id', id);
      results.push({
        id,
        event_type: eventType,
        recipient_count: 0,
        token_count: 0,
        sent: false,
        error: 'max_attempts_exceeded',
      });
      continue;
    }

    if (targetUserIds.length === 0) {
      await supabase
        .from('calendar_event_notification_jobs')
        .update({
          processed_at: new Date().toISOString(),
          attempts: attempts + 1,
          last_error: null,
          claimed_at: null,
          claim_expires_at: null,
        })
        .eq('id', id);
      results.push({
        id,
        event_type: eventType,
        recipient_count: 0,
        token_count: 0,
        sent: true,
      });
      continue;
    }

    const titleText = (payload.title as string) || 'Event';
    const whenLabel = formatWhen(payload);
    const { title: pushTitle, body: pushBody } = pushCopy(eventType, titleText);

    const { data: tokenRows, error: tokErr } = await supabase
      .from('push_tokens')
      .select('token, user_id')
      .in('user_id', targetUserIds);

    if (tokErr) {
      await supabase
        .from('calendar_event_notification_jobs')
        .update({
          attempts: attempts + 1,
          last_error: tokErr.message.slice(0, 500),
          claimed_at: null,
          claim_expires_at: null,
        })
        .eq('id', id);
      results.push({
        id,
        event_type: eventType,
        recipient_count: targetUserIds.length,
        token_count: 0,
        sent: false,
        error: tokErr.message,
      });
      continue;
    }

    const tokens = (tokenRows ?? []) as { token: string; user_id: string }[];
    const messages = tokens.map((t) => ({
      to: t.token,
      title: pushTitle,
      body: pushBody,
      sound: 'default' as const,
      data: {
        kind: 'calendar_event',
        event_type: eventType,
        job_id: id,
        event_id: row.event_id,
        ...payload,
      },
    }));

    let sendErr: string | undefined;
    for (let i = 0; i < messages.length; i += CHUNK) {
      const chunk = messages.slice(i, i + CHUNK);
      const r = await sendExpoBatch(chunk);
      if (!r.ok) {
        sendErr = r.error;
        break;
      }
    }

    const { data: profileRows } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .in('id', targetUserIds);

    const emailRecipients = (profileRows ?? [])
      .map((p) => ({
        userId: p.id as string,
        email: (p.email as string | null) ?? '',
      }))
      .filter((p) => p.email.includes('@'));

    const calPath = '/calendar';
    const link = siteBase ? `${siteBase}${calPath}` : calPath;
    const subject =
      eventType === 'invite'
        ? `Calendar invite: ${titleText}`
        : eventType === 'update'
          ? `Calendar event updated: ${titleText}`
          : `Calendar event cancelled: ${titleText}`;

    const bodyHtml =
      eventType === 'cancel'
        ? `<p>The event <strong>${escapeHtml(titleText)}</strong> has been cancelled.</p>`
        : `<p><strong>${escapeHtml(titleText)}</strong></p>` +
          (whenLabel ? `<p><strong>When:</strong> ${escapeHtml(whenLabel)}</p>` : '') +
          `<p><a href="${escapeHtml(link)}">Open calendar</a></p>`;

    const html = `<p>Hi,</p>${bodyHtml}`;

    const emailRes = await sendResendEmails(emailRecipients, subject, html);
    if (!emailRes.ok) {
      console.warn('calendar notify email', emailRes.error);
    }

    if (sendErr) {
      const dead = attempts + 1 >= MAX_ATTEMPTS;
      await supabase
        .from('calendar_event_notification_jobs')
        .update({
          processed_at: dead ? new Date().toISOString() : null,
          attempts: attempts + 1,
          last_error: sendErr.slice(0, 500),
          claimed_at: null,
          claim_expires_at: null,
        })
        .eq('id', id);
      results.push({
        id,
        event_type: eventType,
        recipient_count: targetUserIds.length,
        token_count: messages.length,
        sent: false,
        error: sendErr,
      });
    } else {
      await supabase
        .from('calendar_event_notification_jobs')
        .update({
          processed_at: new Date().toISOString(),
          attempts: attempts + 1,
          last_error: emailRes.ok ? null : (emailRes.error ?? '').slice(0, 500),
          claimed_at: null,
          claim_expires_at: null,
        })
        .eq('id', id);
      results.push({
        id,
        event_type: eventType,
        recipient_count: targetUserIds.length,
        token_count: messages.length,
        sent: true,
      });
    }
  }

  return new Response(JSON.stringify({ ok: true, jobs: results.length, results }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
