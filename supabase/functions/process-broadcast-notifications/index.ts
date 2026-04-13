import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

/**
 * Diagnostic + future fan-out worker for `broadcast_notification_jobs`.
 *
 * Auth: `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` (verify_jwt = false).
 * For each pending job, calls `broadcast_notification_recipient_user_ids` - same rules as
 * `broadcast_visible_to_reader` for sent posts (mandatory, subscriptions, org admins).
 *
 * Next step: join `push_tokens`, send via Expo/FCM, then set `processed_at` / `last_error` on the job.
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    .select('broadcast_id, created_at, attempts')
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
    broadcast_id: string;
    recipient_count: number;
    sample_user_ids: string[];
    rpc_error?: string;
  }[] = [];

  for (const row of jobs ?? []) {
    const broadcastId = row.broadcast_id as string;
    const { data: recipients, error: rpcErr } = await supabase.rpc(
      'broadcast_notification_recipient_user_ids',
      { p_broadcast_id: broadcastId },
    );

    if (rpcErr) {
      results.push({
        broadcast_id: broadcastId,
        recipient_count: 0,
        sample_user_ids: [],
        rpc_error: rpcErr.message,
      });
      continue;
    }

    const ids = (recipients ?? []) as { user_id: string }[];
    const userIds = ids.map((r) => r.user_id).filter(Boolean);
    results.push({
      broadcast_id: broadcastId,
      recipient_count: userIds.length,
      sample_user_ids: userIds.slice(0, 8),
    });
  }

  return new Response(
    JSON.stringify({
      scheduled_released_count: typeof released === 'number' ? released : Number(released ?? 0),
      pending_jobs_scanned: (jobs ?? []).length,
      results,
    }),
    { headers: { ...cors, 'Content-Type': 'application/json' } },
  );
});
