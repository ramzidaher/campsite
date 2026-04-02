import { DEFAULT_PERMISSION_SEED } from '@/lib/authz/defaultPermissions';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { NextResponse } from 'next/server';

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: me } = await supabase.from('profiles').select('org_id, status').eq('id', user.id).maybeSingle();
  if (!me?.org_id || me.status !== 'active') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: allowed } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: me.org_id,
    p_permission_key: 'roles.manage',
    p_context: {},
  });
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Service role key missing' },
      { status: 503 }
    );
  }

  const { error: upsertErr } = await admin.from('permission_catalog').upsert(DEFAULT_PERMISSION_SEED, {
    onConflict: 'key',
    ignoreDuplicates: false,
  });
  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });

  const { count } = await admin.from('permission_catalog').select('key', { head: true, count: 'exact' });
  return NextResponse.json({ ok: true, seeded: DEFAULT_PERMISSION_SEED.length, total: count ?? null });
}

