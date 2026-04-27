import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

type Body = {
  full_name?: string;
  invite_token?: string;
  org_slug?: string;
  department_ids?: string[];
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user?.id || !user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const orgSlug = String(body.org_slug ?? req.headers.get('x-campsite-org-slug') ?? '')
    .trim()
    .toLowerCase();
  const inviteToken = String(body.invite_token ?? '').trim();
  const fullName = String(body.full_name ?? '').trim() || user.email.split('@')[0] || 'Member';
  const deptIds = Array.isArray(body.department_ids)
    ? [...new Set(body.department_ids.filter((x): x is string => typeof x === 'string'))]
    : [];

  if (!orgSlug || !inviteToken) {
    return NextResponse.json({ error: 'Missing organisation context.' }, { status: 400 });
  }

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server misconfiguration';
    return NextResponse.json({ error: msg }, { status: 503 });
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
    return NextResponse.json({ error: 'Invite token is invalid or expired.' }, { status: 403 });
  }

  const validDeptIds = deptIds.filter((id) => UUID_RE.test(id));
  if (validDeptIds.length) {
    const { data: deptRows } = await admin
      .from('departments')
      .select('id')
      .eq('org_id', tokenRow.org_id)
      .eq('is_archived', false)
      .in('id', validDeptIds);
    const allowed = new Set((deptRows ?? []).map((r) => r.id as string));
    for (let i = validDeptIds.length - 1; i >= 0; i -= 1) {
      if (!allowed.has(validDeptIds[i]!)) validDeptIds.splice(i, 1);
    }
  }

  if (validDeptIds.length === 0) {
    const { data: defaultDept } = await admin
      .from('departments')
      .select('id')
      .eq('org_id', tokenRow.org_id)
      .eq('is_archived', false)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (defaultDept?.id) validDeptIds.push(defaultDept.id as string);
  }
  if (validDeptIds.length === 0) {
    return NextResponse.json({ error: 'No default department is configured for this organisation.' }, { status: 400 });
  }

  const { data: existingMembership } = await admin
    .from('user_org_memberships')
    .select('status')
    .eq('user_id', user.id)
    .eq('org_id', tokenRow.org_id)
    .maybeSingle();
  const nextStatus =
    existingMembership?.status === 'active' || existingMembership?.status === 'inactive'
      ? (existingMembership.status as 'active' | 'inactive')
      : 'pending';

  const { error: membershipErr } = await admin.from('user_org_memberships').upsert(
    {
      user_id: user.id,
      org_id: tokenRow.org_id,
      full_name: fullName,
      email: user.email,
      role: 'unassigned',
      status: nextStatus,
    },
    { onConflict: 'user_id,org_id' }
  );
  if (membershipErr) return NextResponse.json({ error: membershipErr.message }, { status: 500 });

  const { data: profileExists } = await admin.from('profiles').select('id').eq('id', user.id).maybeSingle();
  if (!profileExists) {
    const { error: profileErr } = await admin.from('profiles').insert({
      id: user.id,
      org_id: tokenRow.org_id,
      full_name: fullName,
      email: user.email,
      role: 'unassigned',
      status: 'pending',
    });
    if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }

  const { data: orgDeptRows } = await admin.from('departments').select('id').eq('org_id', tokenRow.org_id);
  const orgDeptIds = (orgDeptRows ?? []).map((r) => r.id as string).filter(Boolean);
  if (orgDeptIds.length) {
    await admin.from('user_departments').delete().eq('user_id', user.id).in('dept_id', orgDeptIds);
  }
  await admin
    .from('user_departments')
    .insert(validDeptIds.map((deptId) => ({ user_id: user.id, dept_id: deptId })));

  await admin
    .from('org_signup_invite_tokens')
    .update({ used_count: Number(tokenRow.used_count ?? 0) + 1 })
    .eq('id', tokenRow.id);

  await admin.from('org_membership_audit_events').insert({
    org_id: tokenRow.org_id,
    actor_user_id: user.id,
    target_user_id: user.id,
    event_type: 'membership_join_completed',
    source: 'join_org_for_existing_account',
    payload: { department_count: validDeptIds.length, membership_status: nextStatus },
  });

  if (nextStatus === 'active') {
    const { error: switchErr } = await supabase.rpc('set_my_active_org', { p_org_id: tokenRow.org_id });
    if (switchErr) return NextResponse.json({ error: switchErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: 'active' });
  }

  // Pending joins remain in current org until approved.
  return NextResponse.json({ ok: true, status: 'pending_approval' });
}

