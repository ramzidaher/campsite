import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

/**
 * Drains `broadcast_notification_jobs`: resolves recipients via `broadcast_notification_recipient_user_ids`,
 * loads `push_tokens`, sends via Expo Push API (same pattern as `process-rota-notifications`).
 *
 * Auth: `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` or `apikey` header (verify_jwt = false).
 * Optional: `EXPO_ACCESS_TOKEN` for higher Expo rate limits.
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_ATTEMPTS = 5;
const CHUNK = 99;

/** pg_net / cron often sends `apikey` or a Bearer with stray whitespace; require service role only. */
function isServiceRoleRequest(req: Request, serviceKey: string): boolean {
  if (!serviceKey) return false;
  const apikey = req.headers.get('apikey')?.trim();
  if (apikey === serviceKey) return true;
  const raw = req.headers.get('Authorization')?.trim() ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(raw);
  const bearer = (m?.[1] ?? '').trim();
  return bearer === serviceKey;
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

  if (!serviceKey || !url || !isServiceRoleRequest(req, serviceKey)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(url, serviceKey);

  const { data: released, error: releaseErr } = await supabase.rpc('release_due_scheduled_broadcasts');
  if (releaseErr) {
    return new Response(JSON.stringify({ error: releaseErr.message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const limitJobs = Math.min(
    50,
    Math.max(1, Number(new URL(req.url).searchParams.get('limit')) || 20),
  );

  const { data: jobs, error: jobErr } = await supabase
    .from('broadcast_notification_jobs')
    .select('id, broadcast_id, created_at, attempts')
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
    job_id: string;
    broadcast_id: string;
    recipient_count: number;
    token_count: number;
    sent: boolean;
    sample_user_ids: string[];
    error?: string;
    rpc_error?: string;
  }[] = [];

  for (const row of jobs ?? []) {
    const jobId = row.id as string;
    const broadcastId = row.broadcast_id as string;
    const attempts = (row.attempts as number) ?? 0;

    if (attempts >= MAX_ATTEMPTS) {
      await supabase
        .from('broadcast_notification_jobs')
        .update({
          processed_at: new Date().toISOString(),
          attempts: attempts + 1,
          last_error: 'max_attempts_exceeded',
        })
        .eq('id', jobId);
      results.push({
        job_id: jobId,
        broadcast_id: broadcastId,
        recipient_count: 0,
        token_count: 0,
        sent: false,
        sample_user_ids: [],
        error: 'max_attempts_exceeded',
      });
      continue;
    }

    const { data: recipients, error: rpcErr } = await supabase.rpc(
      'broadcast_notification_recipient_user_ids',
      { p_broadcast_id: broadcastId },
    );

    if (rpcErr) {
      await supabase
        .from('broadcast_notification_jobs')
        .update({
          attempts: attempts + 1,
          last_error: rpcErr.message.slice(0, 500),
        })
        .eq('id', jobId);
      results.push({
        job_id: jobId,
        broadcast_id: broadcastId,
        recipient_count: 0,
        token_count: 0,
        sent: false,
        sample_user_ids: [],
        rpc_error: rpcErr.message,
      });
      continue;
    }

    const userIds = Array.from(
      new Set((recipients ?? []).map((r: { user_id: string }) => r.user_id).filter(Boolean)),
    );

    if (userIds.length === 0) {
      const now = new Date().toISOString();
      await supabase
        .from('broadcast_notification_jobs')
        .update({
          processed_at: now,
          attempts: attempts + 1,
          last_error: null,
        })
        .eq('id', jobId);
      await supabase.from('broadcasts').update({ notifications_sent_at: now }).eq('id', broadcastId);
      results.push({
        job_id: jobId,
        broadcast_id: broadcastId,
        recipient_count: 0,
        token_count: 0,
        sent: true,
        sample_user_ids: [],
      });
      continue;
    }

    const { data: bRow } = await supabase.from('broadcasts').select('title').eq('id', broadcastId).maybeSingle();
    const titleRaw = (bRow as { title?: string } | null)?.title?.trim() || 'Broadcast';
    const pushTitle = 'Broadcast';
    const pushBody = titleRaw.length > 120 ? `${titleRaw.slice(0, 117)}...` : titleRaw;

    const { data: tokenRows, error: tokErr } = await supabase
      .from('push_tokens')
      .select('token, user_id')
      .in('user_id', userIds);

    if (tokErr) {
      await supabase
        .from('broadcast_notification_jobs')
        .update({
          attempts: attempts + 1,
          last_error: tokErr.message.slice(0, 500),
        })
        .eq('id', jobId);
      results.push({
        job_id: jobId,
        broadcast_id: broadcastId,
        recipient_count: userIds.length,
        token_count: 0,
        sent: false,
        sample_user_ids: userIds.slice(0, 8),
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
        kind: 'broadcast',
        broadcast_id: broadcastId,
      },
    }));

    if (messages.length === 0) {
      const now = new Date().toISOString();
      await supabase
        .from('broadcast_notification_jobs')
        .update({
          processed_at: now,
          attempts: attempts + 1,
          last_error: null,
        })
        .eq('id', jobId);
      await supabase.from('broadcasts').update({ notifications_sent_at: now }).eq('id', broadcastId);
      results.push({
        job_id: jobId,
        broadcast_id: broadcastId,
        recipient_count: userIds.length,
        token_count: 0,
        sent: true,
        sample_user_ids: userIds.slice(0, 8),
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
        .from('broadcast_notification_jobs')
        .update({
          processed_at: dead ? new Date().toISOString() : null,
          attempts: attempts + 1,
          last_error: sendErr.slice(0, 500),
        })
        .eq('id', jobId);
      results.push({
        job_id: jobId,
        broadcast_id: broadcastId,
        recipient_count: userIds.length,
        token_count: messages.length,
        sent: false,
        sample_user_ids: userIds.slice(0, 8),
        error: sendErr,
      });
    } else {
      const now = new Date().toISOString();
      await supabase
        .from('broadcast_notification_jobs')
        .update({
          processed_at: now,
          attempts: attempts + 1,
          last_error: null,
        })
        .eq('id', jobId);
      await supabase.from('broadcasts').update({ notifications_sent_at: now }).eq('id', broadcastId);
      results.push({
        job_id: jobId,
        broadcast_id: broadcastId,
        recipient_count: userIds.length,
        token_count: messages.length,
        sent: true,
        sample_user_ids: userIds.slice(0, 8),
      });
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      scheduled_released_count: typeof released === 'number' ? released : Number(released ?? 0),
      pending_jobs_scanned: (jobs ?? []).length,
      results,
    }),
    { headers: { ...cors, 'Content-Type': 'application/json' } },
  );
});
