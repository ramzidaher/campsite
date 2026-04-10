import { createClient } from '@/lib/supabase/server';
import { buildPermissionPickerItems } from '@/lib/authz/buildPermissionPicker';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

async function gateOverrides(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actorId: string,
  orgId: string,
  targetUserId: string,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const [{ data: editRoles }, { data: manageRoles }] = await Promise.all([
    supabase.rpc('has_permission', {
      p_user_id: actorId,
      p_org_id: orgId,
      p_permission_key: 'members.edit_roles',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: actorId,
      p_org_id: orgId,
      p_permission_key: 'roles.manage',
      p_context: {},
    }),
  ]);
  if (!editRoles && !manageRoles) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  const [{ data: isAdmin }, { data: isReport }] = await Promise.all([
    supabase.rpc('is_effective_org_admin', { p_user_id: actorId, p_org_id: orgId }),
    supabase.rpc('is_reports_descendant_in_org', {
      p_org_id: orgId,
      p_ancestor: actorId,
      p_descendant: targetUserId,
    }),
  ]);

  if (!isAdmin && !isReport) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Overrides can only be managed for your direct or indirect reports' }, { status: 403 }),
    };
  }

  return { ok: true };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: me } = await supabase.from('profiles').select('org_id, status').eq('id', user.id).maybeSingle();
  if (!me?.org_id || me.status !== 'active') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const g = await gateOverrides(supabase, user.id, me.org_id, userId);
  if (!g.ok) return g.response;

  const [{ data: overrides, error: ovErr }, picker] = await Promise.all([
    supabase
      .from('user_permission_overrides')
      .select('id, mode, permission_key, created_at')
      .eq('org_id', me.org_id)
      .eq('user_id', userId)
      .order('mode', { ascending: true })
      .order('permission_key', { ascending: true }),
    buildPermissionPickerItems(supabase, me.org_id),
  ]);

  if (ovErr) return NextResponse.json({ error: ovErr.message }, { status: 400 });

  return NextResponse.json({
    overrides: overrides ?? [],
    permission_picker: { schema_version: picker.schema_version, items: picker.items },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: me } = await supabase.from('profiles').select('org_id, status').eq('id', user.id).maybeSingle();
  if (!me?.org_id || me.status !== 'active') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const g = await gateOverrides(supabase, user.id, me.org_id, userId);
  if (!g.ok) return g.response;

  const body = (await req.json().catch(() => null)) as
    | {
        op?: string;
        mode?: string;
        permission_key?: string;
        modes?: string[];
      }
    | null;
  if (!body?.op) return NextResponse.json({ error: 'op is required' }, { status: 400 });

  if (body.op === 'upsert') {
    if (!body.mode || !body.permission_key) return NextResponse.json({ error: 'mode and permission_key required' }, { status: 400 });
    const { error } = await supabase.rpc('user_permission_override_upsert', {
      p_org_id: me.org_id,
      p_target_user_id: userId,
      p_mode: body.mode,
      p_permission_key: body.permission_key,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.op === 'delete') {
    if (!body.mode || !body.permission_key) return NextResponse.json({ error: 'mode and permission_key required' }, { status: 400 });
    const { error } = await supabase.rpc('user_permission_override_delete', {
      p_org_id: me.org_id,
      p_target_user_id: userId,
      p_mode: body.mode,
      p_permission_key: body.permission_key,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.op === 'clear_modes') {
    const { error } = await supabase.rpc('user_permission_overrides_clear_for_user', {
      p_org_id: me.org_id,
      p_target_user_id: userId,
      p_modes: body.modes?.length ? body.modes : null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'unknown op' }, { status: 400 });
}
