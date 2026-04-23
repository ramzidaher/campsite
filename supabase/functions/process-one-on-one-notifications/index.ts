import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

/**
 * Drains `one_on_one_notification_jobs`: resolves recipients via
 * `one_on_one_notification_recipient_user_ids`, sends Expo push (same as rota worker).
 *
 * Auth: `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` (verify_jwt = false).
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_ATTEMPTS = 5;
const CHUNK = 99;

function pushCopy(eventType: string): { title: string; body: string } {
  switch (eventType) {
    case 'meeting_reminder':
      return { title: '1:1 check-in', body: 'Upcoming 1:1 meeting reminder.' };
    case 'pair_overdue_nudge':
      return { title: '1:1 check-in', body: 'A direct report may be due for a 1:1.' };
    default:
      return { title: '1:1', body: 'Check-in update.' };
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

  const { error: enqRem } = await supabase.rpc('enqueue_one_on_one_meeting_reminders');
  if (enqRem) {
    console.warn('enqueue_one_on_one_meeting_reminders', enqRem.message);
  }
  const { error: enqNudge } = await supabase.rpc('enqueue_one_on_one_overdue_nudges');
  if (enqNudge) {
    console.warn('enqueue_one_on_one_overdue_nudges', enqNudge.message);
  }

  const limitJobs = Math.min(
    50,
    Math.max(1, Number(new URL(req.url).searchParams.get('limit')) || 20),
  );

  const { data: jobs, error: jobErr } = await supabase.rpc('claim_one_on_one_notification_jobs', {
    p_limit: limitJobs,
    p_lease_seconds: 120,
  });

  if (jobErr) {
    return new Response(JSON.stringify({ error: jobErr.message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

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

    if (attempts >= MAX_ATTEMPTS) {
      await supabase
        .from('one_on_one_notification_jobs')
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

    const { data: recipientRows, error: rpcErr } = await supabase.rpc('one_on_one_notification_recipient_user_ids', {
      p_job_id: id,
    });

    if (rpcErr) {
      await supabase
        .from('one_on_one_notification_jobs')
        .update({
          attempts: attempts + 1,
          last_error: rpcErr.message.slice(0, 500),
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
        error: rpcErr.message,
      });
      continue;
    }

    const userIds = Array.from(
      new Set((recipientRows ?? []).map((r: { user_id: string }) => r.user_id).filter(Boolean)),
    );

    if (userIds.length === 0) {
      await supabase
        .from('one_on_one_notification_jobs')
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

    const { data: tokenRows, error: tokErr } = await supabase
      .from('push_tokens')
      .select('token, user_id')
      .in('user_id', userIds);

    if (tokErr) {
      await supabase
        .from('one_on_one_notification_jobs')
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
        recipient_count: userIds.length,
        token_count: 0,
        sent: false,
        error: tokErr.message,
      });
      continue;
    }

    const tokens = (tokenRows ?? []) as { token: string; user_id: string }[];
    const { title, body } = pushCopy(eventType);
    const messages = tokens.map((t) => ({
      to: t.token,
      title,
      body,
      sound: 'default' as const,
      data: {
        kind: 'one_on_one',
        event_type: eventType,
        job_id: id,
        ...payload,
      },
    }));

    if (messages.length === 0) {
      await supabase
        .from('one_on_one_notification_jobs')
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
        recipient_count: userIds.length,
        token_count: 0,
        sent: true,
      });
      continue;
    }

    let sendErr: string | undefined;
    for (let i = 0; i < messages.length; i += CHUNK) {
      const chunk = messages.slice(i, i + CHUNK);
      const r = await sendExpoBatch(chunk);
      if (!r.ok) {
        sendErr = r.error;
        break;
      }
    }

    if (sendErr) {
      const dead = attempts + 1 >= MAX_ATTEMPTS;
      await supabase
        .from('one_on_one_notification_jobs')
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
        recipient_count: userIds.length,
        token_count: messages.length,
        sent: false,
        error: sendErr,
      });
    } else {
      await supabase
        .from('one_on_one_notification_jobs')
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
        recipient_count: userIds.length,
        token_count: messages.length,
        sent: true,
      });
    }
  }

  return new Response(JSON.stringify({ ok: true, jobs: results.length, results }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
