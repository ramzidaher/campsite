import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import {
  mintTokenString,
  nextMidnightUtcEpochSeconds,
  sha256Hex,
  type TokenPayload,
} from '../_shared/staff_qr_crypto.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const secret = Deno.env.get('STAFF_QR_SIGNING_SECRET')?.trim();
  if (!secret) {
    return new Response(JSON.stringify({ error: 'Server misconfigured: missing STAFF_QR_SIGNING_SECRET' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  let manual = false;
  try {
    const body = (await req.json()) as { manual?: boolean };
    manual = !!body?.manual;
  } catch {
    /* empty body */
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: profile, error: profErr } = await admin
    .from('profiles')
    .select('id, org_id, role, status')
    .eq('id', user.id)
    .single();

  if (profErr || !profile?.org_id) {
    return new Response(JSON.stringify({ error: 'Profile not found' }), {
      status: 403,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
  if (profile.status !== 'active') {
    return new Response(JSON.stringify({ error: 'Account not active' }), {
      status: 403,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const issuedReason = manual ? 'manual' : 'auto';

  if (manual) {
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recent } = await admin
      .from('staff_qr_tokens')
      .select('id')
      .eq('user_id', user.id)
      .eq('issued_reason', 'manual')
      .gte('issued_at', since)
      .limit(1);
    if (recent?.length) {
      return new Response(
        JSON.stringify({ error: 'Refresh available once every 10 minutes.' }),
        { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } },
      );
    }
  }

  await admin.from('staff_qr_tokens').delete().eq('user_id', user.id).gte('expires_at', new Date().toISOString());

  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = nextMidnightUtcEpochSeconds();
  const nonce = crypto.randomUUID();
  const payload: TokenPayload = {
    uid: user.id,
    oid: profile.org_id as string,
    role: profile.role as string,
    iat: nowSec,
    exp: expSec,
    n: nonce,
  };

  const token = await mintTokenString(secret, payload);
  const tokenHash = await sha256Hex(token);

  const expiresAtIso = new Date(expSec * 1000).toISOString();
  const { error: insErr } = await admin.from('staff_qr_tokens').insert({
    user_id: user.id,
    token_hash: tokenHash,
    issued_reason: issuedReason,
    expires_at: expiresAtIso,
  });

  if (insErr) {
    return new Response(JSON.stringify({ error: insErr.message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({
      token,
      expiresAt: expiresAtIso,
      issuedAt: new Date().toISOString(),
    }),
    { headers: { ...cors, 'Content-Type': 'application/json' } },
  );
});
