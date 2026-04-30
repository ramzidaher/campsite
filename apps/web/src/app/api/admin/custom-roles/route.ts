import { createClient } from '@/lib/supabase/server';
import { invalidateAllShellCaches } from '@/lib/cache/cacheInvalidation';
import {
  CUSTOM_ROLE_PICKER_SCHEMA_VERSION,
  type CustomRolesListResponse,
} from '@/lib/authz/customRolePickerContract';
import { buildPermissionPickerItems } from '@/lib/authz/buildPermissionPicker';
import { validateCustomRolePermissionKeys } from '@/lib/authz/validateCustomRolePermissions';
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

/** GET: custom roles + permission picker contract for the tenant admin UI. */
export async function GET() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: me } = await supabase.from('profiles').select('org_id, status').eq('id', user.id).maybeSingle();
  if (!me?.org_id || me.status !== 'active') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const gate = await requireRolesManage(supabase, user.id, me.org_id);
  if (!gate.ok) return gate.response;

  let picker;
  try {
    picker = await buildPermissionPickerItems(supabase, me.org_id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Permission picker failed';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { data: roles, error: rolesErr } = await supabase
    .from('org_roles')
    .select('id, key, label, description, is_system, is_archived, org_role_permissions(permission_key)')
    .eq('org_id', me.org_id)
    .eq('is_system', false)
    .eq('is_archived', false)
    .order('label');

  if (rolesErr) return NextResponse.json({ error: rolesErr.message }, { status: 400 });

  const custom_roles = (roles ?? []).map((r) => {
    const perms = (r.org_role_permissions as Array<{ permission_key: string }> | null) ?? [];
    return {
      id: r.id,
      key: r.key,
      label: r.label,
      description: r.description ?? '',
      is_system: false as const,
      is_archived: Boolean(r.is_archived),
      permission_keys: perms.map((p) => p.permission_key).filter(Boolean),
    };
  });

  const body: CustomRolesListResponse = {
    schema_version: CUSTOM_ROLE_PICKER_SCHEMA_VERSION,
    custom_roles,
    permission_picker: {
      schema_version: picker.schema_version,
      items: picker.items,
    },
  };

  return NextResponse.json(body);
}

/**
 * POST: create a custom role (is_system=false). permission_keys must be a subset of viewer grants (server enforced in RPC).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: me } = await supabase.from('profiles').select('org_id, status').eq('id', user.id).maybeSingle();
  if (!me?.org_id || me.status !== 'active') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const gate = await requireRolesManage(supabase, user.id, me.org_id);
  if (!gate.ok) return gate.response;

  let picker;
  try {
    picker = await buildPermissionPickerItems(supabase, me.org_id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Permission picker failed';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        key?: string;
        label?: string;
        description?: string;
        permission_keys?: string[];
      }
    | null;
  if (!body?.key || !body.label) return NextResponse.json({ error: 'key and label are required' }, { status: 400 });

  const keys = body.permission_keys ?? [];
  const v = validateCustomRolePermissionKeys(keys, picker.items);
  if (!v.ok) {
    return NextResponse.json({ error: v.error, invalid_keys: v.invalid_keys }, { status: 400 });
  }

  const { data: roleId, error } = await supabase.rpc('create_org_role', {
    p_org_id: me.org_id,
    p_key: body.key,
    p_label: body.label,
    p_description: body.description ?? '',
    p_permission_keys: keys,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await invalidateAllShellCaches();
  return NextResponse.json({ ok: true, role_id: roleId }, { status: 201 });
}
