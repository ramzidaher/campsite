import { sendOrgMemberAccessEmail } from '@/lib/admin/sendOrgMemberAccessEmail';
import { inviteCallbackUrl } from '@/lib/auth/inviteCallbackBaseUrl';
import {
  invalidateOrgMemberCachesForOrg,
  invalidateShellCacheForUser,
} from '@/lib/cache/cacheInvalidation';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getSupabaseServiceRoleKey } from '@/lib/supabase/env';
import { type ProfileRole } from '@campsite/types';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  if (!getSupabaseServiceRoleKey()) {
    return NextResponse.json(
      {
        error:
          'Email invites need SUPABASE_SERVICE_ROLE_KEY on the server (never expose it to the browser). Add it in .env for this app.',
      },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: me } = await supabase
    .from('profiles')
    .select('org_id, role, status')
    .eq('id', user.id)
    .maybeSingle();

  if (!me?.org_id || me.status !== 'active') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const orgId = me.org_id as string;
  const { data: canInvite, error: invitePermErr } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: orgId,
    p_permission_key: 'members.invite',
    p_context: {},
  });
  if (invitePermErr || !canInvite) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  const fullName = typeof b.full_name === 'string' ? b.full_name.trim() : '';
  const role = typeof b.role === 'string' ? b.role.trim() : '';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }
  if (!fullName || fullName.length > 200) {
    return NextResponse.json({ error: 'Enter a name (max 200 characters).' }, { status: 400 });
  }

  if (!role) {
    return NextResponse.json({ error: 'Role is required.' }, { status: 400 });
  }
  const { data: roleRow, error: roleErr } = await supabase
    .from('org_roles')
    .select('id, key')
    .eq('org_id', orgId)
    .eq('key', role)
    .eq('is_archived', false)
    .maybeSingle();
  if (roleErr || !roleRow) {
    return NextResponse.json({ error: 'Invalid role for this organisation.' }, { status: 400 });
  }

  let deptIds: string[] = [];
  if (b.department_ids !== undefined && b.department_ids !== null) {
    if (!Array.isArray(b.department_ids)) {
      return NextResponse.json({ error: 'department_ids must be an array.' }, { status: 400 });
    }
    const raw = b.department_ids.filter((x): x is string => typeof x === 'string');
    deptIds = [...new Set(raw.map((x) => x.trim()).filter(Boolean))];
    for (const id of deptIds) {
      if (!UUID_RE.test(id)) {
        return NextResponse.json({ error: 'Invalid department id.' }, { status: 400 });
      }
    }
  }

  if (deptIds.length) {
    const { data: okRows, error: deptErr } = await supabase
      .from('departments')
      .select('id')
      .eq('org_id', orgId)
      .eq('is_archived', false)
      .in('id', deptIds);
    if (deptErr) {
      return NextResponse.json({ error: deptErr.message }, { status: 400 });
    }
    if ((okRows ?? []).length !== deptIds.length) {
      return NextResponse.json(
        { error: 'One or more departments are not in your organisation.' },
        { status: 400 }
      );
    }
  }

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server misconfiguration';
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  const deptArray = deptIds.length ? deptIds : [];
  const redirectTo = inviteCallbackUrl(req);

  let targetUserId: string | null = null;
  let accessEmailChannel: 'invite' | 'magiclink' | null = null;
  let sentInviteEmail = false;

  if (redirectTo) {
    const sent = await sendOrgMemberAccessEmail(admin, email, redirectTo, {
      full_name: fullName,
    });
    if (!sent.ok) {
      return NextResponse.json({ error: sent.error }, { status: 400 });
    }
    accessEmailChannel = sent.channel;
    sentInviteEmail = sent.channel === 'invite';
    if (sent.channel === 'invite') {
      const { data: existingId, error: lookErr } = await admin.rpc('admin_find_auth_user_id_by_email', {
        p_email: email,
      });
      if (lookErr) {
        return NextResponse.json({ error: lookErr.message }, { status: 500 });
      }
      const id = typeof existingId === 'string' ? existingId : null;
      if (id && UUID_RE.test(id)) targetUserId = id;
    }
  }

  if (!targetUserId) {
    const { data: existingId, error: lookErr } = await admin.rpc('admin_find_auth_user_id_by_email', {
      p_email: email,
    });
    if (lookErr) {
      return NextResponse.json({ error: lookErr.message }, { status: 500 });
    }
    const id = typeof existingId === 'string' ? existingId : null;
    if (!id || !UUID_RE.test(id)) {
      return NextResponse.json(
        { error: 'We could not complete the access setup for that email. Please try again shortly.' },
        { status: 400 }
      );
    }
    targetUserId = id;
  }

  const { error: rpcErr } = await admin.rpc('admin_provision_invited_member', {
    p_user_id: targetUserId,
    p_org_id: orgId,
    p_full_name: fullName,
    p_role: roleRow.key as ProfileRole,
    p_dept_ids: deptArray,
  });

  if (rpcErr) {
    if (sentInviteEmail && targetUserId) {
      const { error: delErr } = await admin.auth.admin.deleteUser(targetUserId);
      if (delErr) {
        console.error(
          'invite-member: provision failed and deleteUser failed',
          rpcErr.message,
          delErr.message
        );
      }
    }
    const lower = rpcErr.message.toLowerCase();
    const status = lower.includes('another organisation') ? 409 : 500;
    return NextResponse.json({ error: rpcErr.message || 'Could not finish setting up this member.' }, { status });
  }

  await admin.from('org_membership_audit_events').insert({
    org_id: orgId,
    actor_user_id: user.id,
    target_user_id: targetUserId,
    event_type: 'membership_provisioned',
    source: 'admin_invite_member',
    payload: {
      access_email_channel: accessEmailChannel,
      role: roleRow.key,
      department_count: deptArray.length,
    },
  });

  await Promise.all([
    invalidateOrgMemberCachesForOrg(orgId),
    targetUserId ? invalidateShellCacheForUser(targetUserId) : Promise.resolve(),
  ]);
  return NextResponse.json({
    ok: true,
    accessEmailChannel,
    sentAccessEmail: accessEmailChannel !== null,
  });
}
