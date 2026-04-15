import { decryptUkTaxDetails } from '@/lib/security/ukTaxCrypto';
import { hasRecentReauth } from '@/lib/security/recentReauth';
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
  const [viewAll, viewOwn] = await Promise.all([
    supabase.rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'payroll.uk_tax.view_all', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'payroll.uk_tax.view_own', p_context: {} }),
  ]);

  const { data: row } = await supabase
    .from('employee_uk_tax_details')
    .select('id, user_id, encrypted_payload')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: 'Record not found' }, { status: 404 });

  const canReveal = Boolean(viewAll.data) || (row.user_id === user.id && Boolean(viewOwn.data));
  if (!canReveal) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  if (!hasRecentReauth(user)) {
    return NextResponse.json({ error: 'Recent re-authentication required' }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!reason) return NextResponse.json({ error: 'Reveal reason is required' }, { status: 400 });

  const details = decryptUkTaxDetails(row.encrypted_payload as string);

  await supabase.from('employee_uk_tax_detail_events').insert({
    org_id: orgId,
    uk_tax_detail_id: id,
    user_id: row.user_id as string,
    actor_user_id: user.id,
    event_type: 'revealed',
    reason,
    payload: { revealed_at: new Date().toISOString() },
  });
  return NextResponse.json({ details });
}
