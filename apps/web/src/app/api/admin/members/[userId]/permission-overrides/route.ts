import { createClient } from '@/lib/supabase/server';
import { buildPermissionPickerItems } from '@/lib/authz/buildPermissionPicker';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { DEFAULT_PERMISSION_SEED } from '@/lib/authz/defaultPermissions';
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

  const [{ data: overrides, error: ovErr }, rawPicker, { data: assignment, error: assignErr }] = await Promise.all([
    supabase
      .from('user_permission_overrides')
      .select('id, mode, permission_key, created_at')
      .eq('org_id', me.org_id)
      .eq('user_id', userId)
      .order('mode', { ascending: true })
      .order('permission_key', { ascending: true }),
    buildPermissionPickerItems(supabase, me.org_id),
    supabase
      .from('user_org_role_assignments')
      .select('role_id')
      .eq('org_id', me.org_id)
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  if (ovErr) return NextResponse.json({ error: ovErr.message }, { status: 400 });
  if (assignErr) return NextResponse.json({ error: assignErr.message }, { status: 400 });

  let picker = rawPicker;
  if ((picker.items?.length ?? 0) === 0) {
    try {
      const admin = createServiceRoleClient();
      await admin.from('permission_catalog').upsert(DEFAULT_PERMISSION_SEED, {
        onConflict: 'key',
        ignoreDuplicates: false,
      });
      const { data: allPermissionsAdmin } = await admin
        .from('permission_catalog')
        .select('key, label, description, is_founder_only')
        .order('key');
      if (allPermissionsAdmin?.length) {
        const { data: mine } = await supabase.rpc('get_my_permissions', { p_org_id: me.org_id });
        const granted = new Set(
          (mine ?? []).map((row: unknown) =>
            typeof row === 'object' && row !== null && 'permission_key' in row
              ? String((row as { permission_key: string }).permission_key)
              : String(row),
          ),
        );
        picker = {
          schema_version: rawPicker.schema_version,
          items: allPermissionsAdmin.map((row) => ({
            key: row.key,
            label: row.label,
            description: row.description ?? '',
            is_founder_only: Boolean(row.is_founder_only),
            assignable_into_custom_role: granted.has(row.key),
          })),
        };
      }
    } catch {
      // keep original picker response; UI will still render safely
    }
  }

  let baseRole:
    | {
        key: string;
        label: string;
      }
    | null = null;
  let baseRolePermissionKeys: string[] = [];

  if (assignment?.role_id) {
    const [{ data: roleRow, error: roleErr }, { data: rolePerms, error: permsErr }] = await Promise.all([
      supabase.from('org_roles').select('key, label').eq('id', assignment.role_id).maybeSingle(),
      supabase.from('org_role_permissions').select('permission_key').eq('role_id', assignment.role_id),
    ]);
    if (roleErr) return NextResponse.json({ error: roleErr.message }, { status: 400 });
    if (permsErr) return NextResponse.json({ error: permsErr.message }, { status: 400 });
    if (roleRow) {
      baseRole = { key: roleRow.key, label: roleRow.label };
      baseRolePermissionKeys = (rolePerms ?? []).map((p) => p.permission_key);
    }
  }

  return NextResponse.json({
    overrides: overrides ?? [],
    permission_picker: { schema_version: picker.schema_version, items: picker.items },
    base_role: baseRole,
    base_role_permission_keys: baseRolePermissionKeys,
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
        permission_keys?: string[];
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

  if (body.op === 'upsert_batch') {
    if (!body.mode || !Array.isArray(body.permission_keys)) {
      return NextResponse.json({ error: 'mode and permission_keys array required' }, { status: 400 });
    }
    const keys = [...new Set(body.permission_keys.map((k) => String(k).trim()).filter(Boolean))];
    if (keys.length === 0) return NextResponse.json({ error: 'permission_keys required' }, { status: 400 });
    for (const permission_key of keys) {
      const { error } = await supabase.rpc('user_permission_override_upsert', {
        p_org_id: me.org_id,
        p_target_user_id: userId,
        p_mode: body.mode,
        p_permission_key: permission_key,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }
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
