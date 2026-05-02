import { createClient } from '@/lib/supabase/server';
import { invalidateShellCachesForOrg } from '@/lib/cache/cacheInvalidation';
import { buildPermissionPickerItems } from '@/lib/authz/buildPermissionPicker';
import { validateCustomRolePermissionKeys } from '@/lib/authz/validateCustomRolePermissions';
import type { CustomRoleResponse } from '@/lib/authz/customRolePickerContract';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

async function requireRolesManage(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, orgId: string) {
  const { data: allowed, error } = await supabase.rpc('has_permission', {
    p_user_id: userId,
    p_org_id: orgId,
    p_permission_key: 'roles.manage',
    p_context: {},
  });
  if (error) return { ok: false as const, response: NextResponse.json({ error: error.message }, { status: 400 }) };
  if (!allowed) return { ok: false as const, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { ok: true as const };
}

async function loadCustomRole(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  roleId: string,
): Promise<
  | { ok: true; role: CustomRoleResponse }
  | { ok: false; response: NextResponse }
> {
  const { data: row, error } = await supabase
    .from('org_roles')
    .select('id, key, label, description, is_system, is_archived, org_role_permissions(permission_key)')
    .eq('org_id', orgId)
    .eq('id', roleId)
    .maybeSingle();
  if (error) return { ok: false, response: NextResponse.json({ error: error.message }, { status: 400 }) };
  if (!row) return { ok: false, response: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  if (row.is_system) return { ok: false, response: NextResponse.json({ error: 'Not a custom role' }, { status: 404 }) };
  const perms = (row.org_role_permissions as Array<{ permission_key: string }> | null) ?? [];
  return {
    ok: true,
    role: {
      id: row.id,
      key: row.key,
      label: row.label,
      description: row.description ?? '',
      is_system: false,
      is_archived: Boolean(row.is_archived),
      permission_keys: perms.map((p) => p.permission_key).filter(Boolean),
    },
  };
}

/** GET: single custom role (404 if system role or missing). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  const { roleId } = await params;
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: me } = await supabase.from('profiles').select('org_id, status').eq('id', user.id).maybeSingle();
  if (!me?.org_id || me.status !== 'active') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const gate = await requireRolesManage(supabase, user.id, me.org_id);
  if (!gate.ok) return gate.response;

  const loaded = await loadCustomRole(supabase, me.org_id, roleId);
  if (!loaded.ok) return loaded.response;

  let picker;
  try {
    picker = await buildPermissionPickerItems(supabase, me.org_id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Permission picker failed';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ role: loaded.role, permission_picker: { items: picker.items, schema_version: picker.schema_version } });
}

/** PATCH: update label/description/permission set (RPC enforces subset + system-role block). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  const { roleId } = await params;
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: me } = await supabase.from('profiles').select('org_id, status').eq('id', user.id).maybeSingle();
  if (!me?.org_id || me.status !== 'active') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const gate = await requireRolesManage(supabase, user.id, me.org_id);
  if (!gate.ok) return gate.response;

  const loaded = await loadCustomRole(supabase, me.org_id, roleId);
  if (!loaded.ok) return loaded.response;
  if (loaded.role.is_archived) {
    return NextResponse.json({ error: 'Cannot update archived role' }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as
    | { label?: string; description?: string; permission_keys?: string[] }
    | null;
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  let picker;
  try {
    picker = await buildPermissionPickerItems(supabase, me.org_id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Permission picker failed';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const keys = body.permission_keys ?? loaded.role.permission_keys;
  const v = validateCustomRolePermissionKeys(keys, picker.items);
  if (!v.ok) {
    return NextResponse.json({ error: v.error, invalid_keys: v.invalid_keys }, { status: 400 });
  }

  const { error } = await supabase.rpc('update_org_role_permissions', {
    p_org_id: me.org_id,
    p_role_id: roleId,
    p_label: body.label ?? null,
    p_description: body.description ?? null,
    p_permission_keys: keys,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await invalidateShellCachesForOrg(me.org_id as string);
  return NextResponse.json({ ok: true });
}

/** DELETE: archive custom role (soft delete). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  const { roleId } = await params;
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: me } = await supabase.from('profiles').select('org_id, status').eq('id', user.id).maybeSingle();
  if (!me?.org_id || me.status !== 'active') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const gate = await requireRolesManage(supabase, user.id, me.org_id);
  if (!gate.ok) return gate.response;

  const loaded = await loadCustomRole(supabase, me.org_id, roleId);
  if (!loaded.ok) return loaded.response;

  const { error } = await supabase.rpc('archive_org_custom_role', {
    p_org_id: me.org_id,
    p_role_id: roleId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await invalidateShellCachesForOrg(me.org_id as string);
  return NextResponse.json({ ok: true });
}
