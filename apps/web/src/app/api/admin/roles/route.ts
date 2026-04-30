import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { DEFAULT_PERMISSION_SEED } from '@/lib/authz/defaultPermissions';
import { invalidateAllShellCaches } from '@/lib/cache/cacheInvalidation';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export async function GET() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: me } = await supabase.from('profiles').select('org_id, status').eq('id', user.id).maybeSingle();
  if (!me?.org_id || me.status !== 'active') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: allowed } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: me.org_id,
    p_permission_key: 'roles.view',
    p_context: {},
  });
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { data: isFounder } = await supabase.rpc('is_platform_founder', { p_user_id: user.id });

  const [
    { data: roles, error: rolesErr },
    { data: allPermissionsUser, error: permsErrUser },
    { data: presets, error: presetsErr },
  ] = await Promise.all([
    supabase
      .from('org_roles')
      .select(
        'id, key, label, description, is_system, is_archived, source_preset_id, source_catalog_version_no, org_role_permissions(permission_key)'
      )
      .eq('org_id', me.org_id)
      .order('is_system', { ascending: false })
      .order('label'),
    supabase.from('permission_catalog').select('key, label, description, is_founder_only').order('key'),
    supabase.rpc('platform_list_role_presets', { p_include_archived: false }),
  ]);
  if (rolesErr) return NextResponse.json({ error: rolesErr.message }, { status: 400 });
  if (permsErrUser) return NextResponse.json({ error: permsErrUser.message }, { status: 400 });
  if (presetsErr) return NextResponse.json({ error: presetsErr.message }, { status: 400 });

  let allPermissions = (allPermissionsUser ?? []).filter((p) => (isFounder ? true : !p?.is_founder_only));
  if (allPermissions.length === 0) {
    console.warn('[admin/roles] permission_catalog returned zero rows', {
      user_id: user.id,
      org_id: me.org_id,
    });
    try {
      const admin = createServiceRoleClient();
      // Self-heal empty permission catalog so role/permission checks work reliably.
      const { error: seedErr } = await admin.from('permission_catalog').upsert(DEFAULT_PERMISSION_SEED, {
        onConflict: 'key',
        ignoreDuplicates: false,
      });
      if (seedErr) {
        console.warn('[admin/roles] permission catalog seed failed', seedErr.message);
      }
      const { data: allPermissionsAdmin, error: permsErrAdmin } = await admin
        .from('permission_catalog')
        .select('key, label, description, is_founder_only')
        .order('key');
      if (!permsErrAdmin && allPermissionsAdmin?.length) {
        allPermissions = allPermissionsAdmin.filter((p) => (isFounder ? true : !p?.is_founder_only));
      }
    } catch (e) {
      console.warn('[admin/roles] service role fallback failed', e);
    }
  }

  return NextResponse.json({ roles: roles ?? [], permissions: allPermissions ?? [], presets: presets ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: me } = await supabase.from('profiles').select('org_id, status').eq('id', user.id).maybeSingle();
  if (!me?.org_id || me.status !== 'active') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | {
        key?: string;
        label?: string;
        description?: string;
        permission_keys?: string[];
        source_preset_id?: string | null;
        source_catalog_version_no?: number | null;
      }
    | null;
  if (!body?.key || !body.label) return NextResponse.json({ error: 'key and label are required' }, { status: 400 });

  const { data, error } = await supabase.rpc('create_org_role', {
    p_org_id: me.org_id,
    p_key: body.key,
    p_label: body.label,
    p_description: body.description ?? '',
    p_permission_keys: body.permission_keys ?? [],
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (body?.source_preset_id) {
    const { error: sourceError } = await supabase
      .from('org_roles')
      .update({
        source_preset_id: body.source_preset_id,
        source_catalog_version_no: body.source_catalog_version_no ?? null,
      })
      .eq('id', data)
      .eq('org_id', me.org_id);
    if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 400 });
  }
  await invalidateAllShellCaches();
  return NextResponse.json({ ok: true, role_id: data });
}
