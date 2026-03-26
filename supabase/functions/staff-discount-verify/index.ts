import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import {
  decodePayload,
  parseTokenString,
  sha256Hex,
  verifyPayloadB64,
} from '../_shared/staff_qr_crypto.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VERIFY_LIMIT = 30;

async function checkRateLimit(
  admin: ReturnType<typeof createClient>,
  orgId: string,
): Promise<boolean> {
  const bucketMs = Math.floor(Date.now() / 60000) * 60000;
  const bucketStart = new Date(bucketMs).toISOString();

  const { data, error } = await admin.rpc('discount_verify_increment', {
    p_org_id: orgId,
    p_bucket: bucketStart,
    p_limit: VERIFY_LIMIT,
  });

  if (error) {
    console.error('rate limit rpc', error);
    return false;
  }
  return data === true;
}

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
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
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

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: scanner, error: scanErr } = await admin
    .from('profiles')
    .select('id, org_id, role, status, full_name')
    .eq('id', user.id)
    .single();

  if (scanErr || !scanner?.org_id || scanner.status !== 'active') {
    return new Response(JSON.stringify({ error: 'Scanner profile invalid' }), {
      status: 403,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const r = scanner.role as string;
  if (!['manager', 'org_admin', 'super_admin', 'duty_manager'].includes(r)) {
    return new Response(JSON.stringify({ error: 'Not allowed to verify cards' }), {
      status: 403,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const orgId = scanner.org_id as string;
  const allowed = await checkRateLimit(admin, orgId);
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded for this organisation' }), {
      status: 429,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  let tokenRaw = '';
  try {
    const body = (await req.json()) as { token?: string };
    tokenRaw = (body?.token ?? '').trim();
  } catch {
    /* */
  }

  const logBase = {
    org_id: orgId,
    scanner_id: user.id,
    scanned_user_id: null as string | null,
    token_valid: false,
    error_code: null as string | null,
    scanned_display_name: null as string | null,
    scanned_role: null as string | null,
    scanned_department: null as string | null,
    discount_label_snapshot: null as string | null,
  };

  const finish = async (extra: Partial<typeof logBase> & { response: Record<string, unknown>; status?: number }) => {
    const { response, status = 200, ...log } = extra;
    await admin.from('scan_logs').insert({ ...logBase, ...log });
    return new Response(JSON.stringify(response), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  };

  if (!tokenRaw) {
    return finish({
      response: { valid: false, error: 'Missing token' },
      status: 400,
      error_code: 'missing_token',
    });
  }

  const parts = parseTokenString(tokenRaw);
  if (!parts) {
    return finish({
      response: { valid: false, error: 'Invalid or expired card' },
      error_code: 'bad_format',
    });
  }

  const payload = decodePayload(parts.payloadB64);
  if (!payload) {
    return finish({
      response: { valid: false, error: 'Invalid or expired card' },
      error_code: 'bad_payload',
    });
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.exp <= nowSec) {
    return finish({
      response: { valid: false, error: 'Invalid or expired card' },
      error_code: 'expired',
    });
  }

  const sigOk = await verifyPayloadB64(secret, payload.oid, parts.payloadB64, parts.sigHex);
  if (!sigOk) {
    return finish({
      response: { valid: false, error: 'Invalid or expired card' },
      error_code: 'bad_signature',
    });
  }

  if (payload.oid !== orgId) {
    return finish({
      response: { valid: false, error: 'Wrong organisation' },
      error_code: 'wrong_org',
    });
  }

  const tokenHash = await sha256Hex(tokenRaw);
  const { data: tokRow } = await admin
    .from('staff_qr_tokens')
    .select('id, expires_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (!tokRow || new Date(tokRow.expires_at as string).getTime() <= Date.now()) {
    return finish({
      response: { valid: false, error: 'Invalid or expired card' },
      error_code: 'not_issued_or_revoked',
    });
  }

  const { data: subject, error: subErr } = await admin
    .from('profiles')
    .select('id, full_name, role, status, org_id')
    .eq('id', payload.uid)
    .single();

  if (subErr || !subject || subject.org_id !== orgId) {
    return finish({
      response: { valid: false, error: 'Invalid or expired card' },
      error_code: 'subject_not_found',
    });
  }

  if (subject.status !== 'active') {
    return finish({
      response: { valid: false, error: 'Staff not active' },
      scanned_user_id: subject.id as string,
      error_code: 'inactive',
      scanned_display_name: subject.full_name as string,
      scanned_role: subject.role as string,
    });
  }

  const { data: udRows } = await admin.from('user_departments').select('dept_id').eq('user_id', payload.uid);
  const deptIds = (udRows ?? []).map((r) => r.dept_id as string).filter(Boolean);
  let department = '—';
  if (deptIds.length) {
    const { data: depRows } = await admin.from('departments').select('name').in('id', deptIds).limit(8);
    const names = (depRows ?? []).map((r) => r.name as string).filter(Boolean);
    if (names.length) department = names.join(', ');
  }

  const { data: tier } = await admin
    .from('discount_tiers')
    .select('label, discount_value, valid_at')
    .eq('org_id', orgId)
    .eq('role', subject.role as string)
    .maybeSingle();

  const discountLabel = tier?.label ?? null;
  const discountValue = tier?.discount_value ?? null;
  const validAt = tier?.valid_at ?? null;

  return finish({
    response: {
      valid: true,
      name: subject.full_name,
      role: subject.role,
      department,
      discount_label: discountLabel,
      discount_value: discountValue,
      valid_at: validAt,
    },
    token_valid: true,
    scanned_user_id: subject.id as string,
    scanned_display_name: subject.full_name as string,
    scanned_role: subject.role as string,
    scanned_department: department,
    discount_label_snapshot: discountLabel,
  });
});
