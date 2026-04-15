import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const supabase = await createClient();
  const { data: profile } = await supabase.from('profiles').select('org_id, status').eq('id', user.id).maybeSingle();
  if (!profile?.org_id || profile.status !== 'active') return NextResponse.json({ error: 'No active org profile' }, { status: 403 });
  const orgId = profile.org_id as string;
  const { data: canManage } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: orgId,
    p_permission_key: 'payroll.bank_details.manage_all',
    p_context: {},
  });
  if (!canManage) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const reviewNote = typeof body.review_note === 'string' ? body.review_note.trim() : null;
  if (!reviewNote) return NextResponse.json({ error: 'Rejection note is required' }, { status: 400 });

  const { data: row, error: rowErr } = await supabase
    .from('employee_bank_details')
    .select('id, org_id, user_id')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle();
  if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 400 });
  if (!row) return NextResponse.json({ error: 'Record not found' }, { status: 404 });

  const { error } = await supabase
    .from('employee_bank_details')
    .update({
      status: 'rejected',
      is_active: false,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_note: reviewNote,
    })
    .eq('id', id)
    .eq('org_id', orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.from('employee_bank_detail_events').insert({
    org_id: orgId,
    bank_detail_id: id,
    user_id: row.user_id as string,
    actor_user_id: user.id,
    event_type: 'rejected',
    reason: reviewNote,
  });

  return NextResponse.json({ ok: true });
}
