import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

/**
 * Drains `rota_notification_jobs`: resolves recipients via `rota_notification_recipient_user_ids`,
 * loads `push_tokens`, sends via Expo Push API (same token format as mobile / scaffold web).
 *
 * Auth: `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` (verify_jwt = false).
 * Optional: `EXPO_ACCESS_TOKEN` for higher Expo rate limits.
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
    case 'shift_created':
      return { title: 'Rota', body: 'A shift was added or assigned.' };
    case 'shift_updated':
      return { title: 'Rota', body: 'A shift was updated.' };
    case 'shift_deleted':
      return { title: 'Rota', body: 'A shift was removed.' };
    case 'shift_reminder':
      return { title: 'Rota', body: 'Upcoming shift reminder.' };
    case 'request_created':
      return { title: 'Rota', body: 'A rota change request needs your attention.' };
    case 'request_peer_accepted':
      return { title: 'Rota', body: 'A swap was accepted - approval needed.' };
    case 'request_resolved':
      return { title: 'Rota', body: 'A rota request was resolved.' };
    default:
      return { title: 'Rota', body: 'Schedule update.' };
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

  const { error: enqErr } = await supabase.rpc('enqueue_rota_shift_reminders');
  if (enqErr) {
    console.warn('enqueue_rota_shift_reminders', enqErr.message);
  }

  const limitJobs = Math.min(
    50,
    Math.max(1, Number(new URL(req.url).searchParams.get('limit')) || 20),
  );

  const { data: jobs, error: jobErr } = await supabase
    .from('rota_notification_jobs')
    .select('id, org_id, event_type, rota_shift_id, change_request_id, payload, created_at, attempts')
    .is('processed_at', null)
    .order('created_at', { ascending: true })
    .limit(limitJobs);

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
        .from('rota_notification_jobs')
        .update({
          processed_at: new Date().toISOString(),
          attempts: attempts + 1,
          last_error: 'max_attempts_exceeded',
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

    const { data: recipientRows, error: rpcErr } = await supabase.rpc('rota_notification_recipient_user_ids', {
      p_job_id: id,
    });

    if (rpcErr) {
      await supabase
        .from('rota_notification_jobs')
        .update({
          attempts: attempts + 1,
          last_error: rpcErr.message.slice(0, 500),
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
        .from('rota_notification_jobs')
        .update({
          processed_at: new Date().toISOString(),
          attempts: attempts + 1,
          last_error: null,
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
        .from('rota_notification_jobs')
        .update({
          attempts: attempts + 1,
          last_error: tokErr.message.slice(0, 500),
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
        kind: 'rota',
        event_type: eventType,
        job_id: id,
        ...payload,
      },
    }));

    if (messages.length === 0) {
      await supabase
        .from('rota_notification_jobs')
        .update({
          processed_at: new Date().toISOString(),
          attempts: attempts + 1,
          last_error: null,
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
        .from('rota_notification_jobs')
        .update({
          processed_at: dead ? new Date().toISOString() : null,
          attempts: attempts + 1,
          last_error: sendErr.slice(0, 500),
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
        .from('rota_notification_jobs')
        .update({
          processed_at: new Date().toISOString(),
          attempts: attempts + 1,
          last_error: null,
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
