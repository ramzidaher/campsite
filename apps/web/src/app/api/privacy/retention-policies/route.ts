import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

async function getCtx(userId: string) {
  const supabase = await createClient();
  const { data: profile } = await supabase.from('profiles').select('org_id, status').eq('id', userId).maybeSingle();
  if (!profile?.org_id || profile.status !== 'active') return null;
  const orgId = profile.org_id as string;
  const [canView, canManage] = await Promise.all([
    supabase.rpc('has_permission', { p_user_id: userId, p_org_id: orgId, p_permission_key: 'privacy.retention_policy.view', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: userId, p_org_id: orgId, p_permission_key: 'privacy.retention_policy.manage', p_context: {} }),
  ]);
  return { supabase, orgId, canView: Boolean(canView.data), canManage: Boolean(canManage.data) };
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const ctx = await getCtx(user.id);
  if (!ctx) return NextResponse.json({ error: 'No active org profile' }, { status: 403 });
  if (!ctx.canView && !ctx.canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { data, error } = await ctx.supabase
    .from('privacy_retention_policies')
    .select('id, domain, retention_days, legal_basis, action, exceptions, is_active')
    .eq('org_id', ctx.orgId)
    .order('domain', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ rows: data ?? [], canManage: ctx.canManage });
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const ctx = await getCtx(user.id);
  if (!ctx) return NextResponse.json({ error: 'No active org profile' }, { status: 403 });
  if (!ctx.canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await request.json().catch(() => ({}));

  const { error } = await ctx.supabase
    .from('privacy_retention_policies')
    .upsert({
      org_id: ctx.orgId,
      domain: clean(body.domain),
      retention_days: Number(body.retention_days ?? 0),
      legal_basis: clean(body.legal_basis) || 'legal_obligation',
      action: clean(body.action) || 'anonymize',
      exceptions: Array.isArray(body.exceptions) ? body.exceptions : [],
      is_active: body.is_active !== false,
      updated_by: user.id,
      created_by: user.id,
    }, { onConflict: 'org_id,domain' });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
