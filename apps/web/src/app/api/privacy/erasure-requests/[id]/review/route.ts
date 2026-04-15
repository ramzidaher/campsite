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
  const { data: canReview } = await supabase.rpc('has_permission', {
    p_user_id: user.id, p_org_id: orgId, p_permission_key: 'privacy.erasure_request.review', p_context: {},
  });
  if (!canReview) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const action = typeof body.action === 'string' ? body.action.trim() : '';
  const note = typeof body.review_note === 'string' ? body.review_note.trim() : '';
  const nextStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : action === 'legal_review' ? 'legal_review' : '';
  if (!nextStatus) return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  const { data: reqRow, error: reqErr } = await supabase
    .from('privacy_erasure_requests')
    .select('id, user_id')
    .eq('id', id)
    .eq('org_id', orgId)
    .single();
  if (reqErr) return NextResponse.json({ error: reqErr.message }, { status: 400 });

  const { error } = await supabase
    .from('privacy_erasure_requests')
    .update({
      status: nextStatus,
      review_note: note || null,
      approved_by: nextStatus === 'approved' ? user.id : null,
      approved_at: nextStatus === 'approved' ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .eq('org_id', orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.from('privacy_erasure_audit_events').insert({
    org_id: orgId,
    erasure_request_id: id,
    user_id: reqRow.user_id as string,
    actor_user_id: user.id,
    event_type: nextStatus === 'approved' ? 'approved' : nextStatus === 'rejected' ? 'rejected' : 'reviewed',
    reason: note || null,
    payload: { action: nextStatus },
  });

  return NextResponse.json({ ok: true });
}
