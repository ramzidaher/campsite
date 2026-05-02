import { createClient } from '@/lib/supabase/server';
import {
  invalidateOrgMemberCachesForOrg,
  invalidateShellCacheForUser,
} from '@/lib/cache/cacheInvalidation';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

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

  const body = (await req.json().catch(() => null)) as { user_id?: string; role_id?: string; role_key?: string } | null;
  if (!body?.user_id) return NextResponse.json({ error: 'user_id is required' }, { status: 400 });

  let roleId = body.role_id ?? '';
  if (!roleId && body.role_key) {
    const { data: role } = await supabase
      .from('org_roles')
      .select('id')
      .eq('org_id', me.org_id)
      .eq('key', body.role_key)
      .eq('is_archived', false)
      .maybeSingle();
    roleId = (role?.id as string | undefined) ?? '';
  }
  if (!roleId) return NextResponse.json({ error: 'role_id or valid role_key is required' }, { status: 400 });

  const { error } = await supabase.rpc('assign_user_org_role', {
    p_org_id: me.org_id,
    p_user_id: body.user_id,
    p_role_id: roleId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await Promise.all([
    invalidateOrgMemberCachesForOrg(me.org_id as string),
    invalidateShellCacheForUser(body.user_id),
    invalidateShellCacheForUser(user.id),
  ]);
  return NextResponse.json({ ok: true });
}
