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

  const body = (await req.json().catch(() => null)) as
    | { user_id?: string; reports_to_user_id?: string | null }
    | null;
  if (!body?.user_id) return NextResponse.json({ error: 'user_id is required' }, { status: 400 });

  const reportsTo = body.reports_to_user_id ?? null;
  const { error } = await supabase.rpc('update_member_reports_to', {
    p_org_id: me.org_id,
    p_target_user_id: body.user_id,
    p_reports_to_user_id: reportsTo,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await Promise.all([
    invalidateOrgMemberCachesForOrg(me.org_id as string),
    invalidateShellCacheForUser(body.user_id),
  ]);
  return NextResponse.json({ ok: true });
}
