import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const supabase = await createClient();
  const { data: profile } = await supabase.from('profiles').select('org_id, status').eq('id', user.id).maybeSingle();
  if (!profile?.org_id || profile.status !== 'active') return NextResponse.json({ error: 'No active org profile' }, { status: 403 });
  const orgId = profile.org_id as string;
  const [canReview, canExecute] = await Promise.all([
    supabase.rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'privacy.erasure_request.review', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'privacy.erasure_request.execute', p_context: {} }),
  ]);
  if (!canReview.data && !canExecute.data) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { data, error } = await supabase.rpc('privacy_erasure_preview', { p_erasure_request_id: id });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ preview: data });
}
