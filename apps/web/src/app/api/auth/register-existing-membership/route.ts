import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Body = {
  email?: string;
  full_name?: string;
  department_ids?: string[];
  invite_token?: string;
  org_slug?: string;
};

function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function genericOk() {
  return NextResponse.json({
    ok: true,
    message: 'If the details are valid, we sent a sign-in link to continue joining this organisation.',
  });
}

export async function POST(req: NextRequest) {
  let body: Body | null = null;
  try {
    body = (await req.json()) as Body;
  } catch {
    return genericOk();
  }

  const email = String(body?.email ?? '')
    .trim()
    .toLowerCase();
  const fullNameRaw = String(body?.full_name ?? '').trim();
  const inviteToken = String(body?.invite_token ?? '').trim();
  const orgSlug = String(body?.org_slug ?? req.headers.get('x-campsite-org-slug') ?? '')
    .trim()
    .toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !inviteToken || !orgSlug) {
    return genericOk();
  }

  const fullName = fullNameRaw || email.split('@')[0] || 'Member';
  const requestDeptIds = Array.isArray(body?.department_ids)
    ? [...new Set(body!.department_ids!.filter((x): x is string => typeof x === 'string'))]
    : [];

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch {
    return genericOk();
  }

  const tokenHash = sha256(inviteToken);
  const { data: tokenRow } = await admin
    .from('org_signup_invite_tokens')
    .select('id, org_id, expires_at, revoked_at, max_uses, used_count, organisations!inner(slug)')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  const tokenOrgSlug = (tokenRow?.organisations as { slug?: string } | null)?.slug?.toLowerCase() ?? '';
  const nowIso = new Date().toISOString();
  const expired = Boolean(tokenRow?.expires_at && tokenRow.expires_at <= nowIso);
  const revoked = Boolean(tokenRow?.revoked_at);
  const maxed =
    tokenRow?.max_uses != null && Number(tokenRow.used_count ?? 0) >= Number(tokenRow.max_uses ?? 0);
  if (!tokenRow || tokenOrgSlug !== orgSlug || expired || revoked || maxed) {
    return genericOk();
  }

  const deptIds = requestDeptIds.filter((id) => UUID_RE.test(id));
  if (deptIds.length) {
    const { data: deptRows } = await admin
      .from('departments')
      .select('id')
      .eq('org_id', tokenRow.org_id)
      .eq('is_archived', false)
      .in('id', deptIds);
    const valid = new Set((deptRows ?? []).map((r) => r.id as string));
    for (let i = deptIds.length - 1; i >= 0; i -= 1) {
      if (!valid.has(deptIds[i]!)) deptIds.splice(i, 1);
    }
  }

  const ipHeader = req.headers.get('x-forwarded-for');
  const requestIp = ipHeader ? ipHeader.split(',')[0]?.trim() ?? null : null;
  const userAgent = req.headers.get('user-agent');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const { data: joinReq, error: joinErr } = await admin
    .from('org_membership_join_requests')
    .insert({
      org_id: tokenRow.org_id,
      email,
      full_name: fullName.slice(0, 200),
      dept_ids: deptIds,
      invite_token_id: tokenRow.id,
      status: 'pending',
      requested_by_ip: requestIp,
      requested_by_user_agent: userAgent ? userAgent.slice(0, 2048) : null,
      expires_at: expiresAt,
    })
    .select('id')
    .single();
  if (joinErr || !joinReq?.id) {
    return genericOk();
  }

  await admin
    .from('org_signup_invite_tokens')
    .update({ used_count: Number(tokenRow.used_count ?? 0) + 1 })
    .eq('id', tokenRow.id);

  const redirectTo = new URL('/auth/callback', req.nextUrl.origin);
  redirectTo.searchParams.set('next', '/pending');
  redirectTo.searchParams.set('join_request', joinReq.id as string);

  await admin.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: redirectTo.toString(),
    },
  });

  await admin.from('org_membership_audit_events').insert({
    org_id: tokenRow.org_id,
    actor_user_id: null,
    target_user_id: null,
    event_type: 'membership_join_requested',
    source: 'register_existing_membership',
    payload: {
      email,
      join_request_id: joinReq.id,
      dept_count: deptIds.length,
    },
  });

  return genericOk();
}

