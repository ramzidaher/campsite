import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const supabase = await createClient();
  const { data: profile } = await supabase.from('profiles').select('org_id, status').eq('id', user.id).maybeSingle();
  if (!profile?.org_id || profile.status !== 'active') return NextResponse.json({ error: 'No active org profile' }, { status: 403 });
  const orgId = profile.org_id as string;
  const { data: canExecute } = await supabase.rpc('has_permission', {
    p_user_id: user.id, p_org_id: orgId, p_permission_key: 'privacy.erasure_request.execute', p_context: {},
  });
  if (!canExecute) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const note = typeof body.execution_note === 'string' ? body.execution_note.trim() : '';
  const { data, error } = await supabase.rpc('privacy_erasure_execute', {
    p_erasure_request_id: id,
    p_execution_note: note || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ result: data });
}
