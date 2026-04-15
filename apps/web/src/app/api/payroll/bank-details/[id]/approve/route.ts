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

  const { data, error } = await supabase.rpc('payroll_approve_bank_detail', {
    p_bank_detail_id: id,
    p_review_note: reviewNote,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, result: data });
}
