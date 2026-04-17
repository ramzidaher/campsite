import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

async function getCtx(userId: string) {
  const supabase = await createClient();
  const { data: profile } = await supabase.from('profiles').select('org_id, status').eq('id', userId).maybeSingle();
  if (!profile?.org_id || profile.status !== 'active') return null;
  return { supabase, orgId: profile.org_id as string };
}

export async function DELETE(_: Request, context: { params: Promise<{ recordId: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const ctx = await getCtx(user.id);
  if (!ctx) return NextResponse.json({ error: 'No active org profile' }, { status: 403 });
  const { supabase, orgId } = ctx;
  const { recordId } = await context.params;
  if (!recordId) return NextResponse.json({ error: 'Missing record id' }, { status: 400 });

  const { error } = await supabase
    .from('employee_training_records')
    .delete()
    .eq('org_id', orgId)
    .eq('id', recordId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
