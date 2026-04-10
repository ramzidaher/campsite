import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  const { roleId } = await params;
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: me } = await supabase.from('profiles').select('org_id, status').eq('id', user.id).maybeSingle();
  if (!me?.org_id || me.status !== 'active') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | { label?: string; description?: string; permission_keys?: string[] }
    | null;
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const { error } = await supabase.rpc('update_org_role_permissions', {
    p_org_id: me.org_id,
    p_role_id: roleId,
    p_label: body.label ?? null,
    p_description: body.description ?? null,
    p_permission_keys: body.permission_keys ?? [],
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

