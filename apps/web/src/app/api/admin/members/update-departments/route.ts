import { NextRequest, NextResponse } from 'next/server';
import {
  invalidateOrgMemberCachesForOrg,
  invalidateShellCacheForUser,
} from '@/lib/cache/cacheInvalidation';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: me } = await supabase.from('profiles').select('org_id, status').eq('id', user.id).maybeSingle();
  if (!me?.org_id || me.status !== 'active') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: canEditRoles } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: me.org_id,
    p_permission_key: 'members.edit_roles',
    p_context: {},
  });
  if (!canEditRoles) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | { user_id?: string; department_ids?: string[] }
    | null;
  if (!body?.user_id || !Array.isArray(body.department_ids)) {
    return NextResponse.json({ error: 'user_id and department_ids are required' }, { status: 400 });
  }
  const targetUserId = body.user_id.trim();
  if (!UUID_RE.test(targetUserId)) {
    return NextResponse.json({ error: 'Invalid user_id' }, { status: 400 });
  }

  const deptIds = [...new Set(body.department_ids.map((id) => id.trim()).filter(Boolean))];
  for (const deptId of deptIds) {
    if (!UUID_RE.test(deptId)) {
      return NextResponse.json({ error: 'Invalid department id.' }, { status: 400 });
    }
  }

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server misconfiguration';
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  const { data: membership } = await admin
    .from('user_org_memberships')
    .select('user_id')
    .eq('user_id', targetUserId)
    .eq('org_id', me.org_id)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: 'User is not a member of this organisation.' }, { status: 404 });
  }

  if (deptIds.length) {
    const { data: validRows } = await admin
      .from('departments')
      .select('id')
      .eq('org_id', me.org_id)
      .eq('is_archived', false)
      .in('id', deptIds);
    if ((validRows ?? []).length !== deptIds.length) {
      return NextResponse.json({ error: 'One or more departments are invalid.' }, { status: 400 });
    }
  }

  const { data: orgDeptRows } = await admin.from('departments').select('id').eq('org_id', me.org_id);
  const orgDeptIds = (orgDeptRows ?? []).map((d) => d.id as string).filter(Boolean);
  if (orgDeptIds.length) {
    const { error: deleteErr } = await admin
      .from('user_departments')
      .delete()
      .eq('user_id', targetUserId)
      .in('dept_id', orgDeptIds);
    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    }
  }

  if (deptIds.length) {
    const { error: insertErr } = await admin
      .from('user_departments')
      .insert(deptIds.map((deptId) => ({ user_id: targetUserId, dept_id: deptId })));
    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
  }

  await admin.from('org_membership_audit_events').insert({
    org_id: me.org_id,
    actor_user_id: user.id,
    target_user_id: targetUserId,
    event_type: 'departments_updated',
    source: 'admin_members_update_departments',
    payload: { department_ids: deptIds },
  });

  await Promise.all([
    invalidateOrgMemberCachesForOrg(me.org_id as string),
    invalidateShellCacheForUser(targetUserId),
  ]);
  return NextResponse.json({ ok: true });
}
