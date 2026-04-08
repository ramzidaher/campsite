import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: me } = await supabase.from('profiles').select('org_id, status').eq('id', user.id).maybeSingle();
  if (!me?.org_id || me.status !== 'active') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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

  return NextResponse.json({ ok: true });
}
