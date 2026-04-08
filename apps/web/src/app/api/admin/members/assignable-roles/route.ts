import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/** Roles the current user may assign (rank ceiling + system/custom rules). */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: me } = await supabase.from('profiles').select('org_id, status').eq('id', user.id).maybeSingle();
  if (!me?.org_id || me.status !== 'active') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: rows, error } = await supabase.rpc('list_assignable_org_roles', { p_org_id: me.org_id });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const roles = (rows ?? []) as Array<{ id: string; key: string; label: string; is_system: boolean }>;
  return NextResponse.json({ roles });
}
