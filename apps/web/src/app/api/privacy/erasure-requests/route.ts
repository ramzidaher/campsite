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
  const [canCreate, canReview, canExecute, canAudit] = await Promise.all([
    supabase.rpc('has_permission', { p_user_id: userId, p_org_id: orgId, p_permission_key: 'privacy.erasure_request.create', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: userId, p_org_id: orgId, p_permission_key: 'privacy.erasure_request.review', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: userId, p_org_id: orgId, p_permission_key: 'privacy.erasure_request.execute', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: userId, p_org_id: orgId, p_permission_key: 'privacy.erasure_request.audit_view', p_context: {} }),
  ]);
  return {
    supabase,
    orgId,
    canCreate: Boolean(canCreate.data),
    canReview: Boolean(canReview.data),
    canExecute: Boolean(canExecute.data),
    canAudit: Boolean(canAudit.data),
  };
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const ctx = await getCtx(user.id);
  if (!ctx) return NextResponse.json({ error: 'No active org profile' }, { status: 403 });
  if (!ctx.canCreate && !ctx.canReview && !ctx.canExecute && !ctx.canAudit) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let query = ctx.supabase
    .from('privacy_erasure_requests')
    .select('id, user_id, requester_user_id, status, request_reason, review_note, execution_note, approved_by, executed_by, approved_at, executed_at, created_at')
    .eq('org_id', ctx.orgId)
    .order('created_at', { ascending: false });
  if (!ctx.canReview && !ctx.canExecute && !ctx.canAudit) {
    query = query.eq('requester_user_id', user.id);
  }
  const { data, error } = await query.limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({
    rows: data ?? [],
    permissions: {
      canCreate: ctx.canCreate,
      canReview: ctx.canReview,
      canExecute: ctx.canExecute,
      canAudit: ctx.canAudit,
    },
  });
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const ctx = await getCtx(user.id);
  if (!ctx) return NextResponse.json({ error: 'No active org profile' }, { status: 403 });
  if (!ctx.canCreate) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await request.json().catch(() => ({}));

  const targetUserId = clean(body.user_id) || user.id;
  const reason = clean(body.request_reason);
  if (!reason) return NextResponse.json({ error: 'Request reason is required' }, { status: 400 });

  const { data: inserted, error } = await ctx.supabase
    .from('privacy_erasure_requests')
    .insert({
      org_id: ctx.orgId,
      user_id: targetUserId,
      requester_user_id: user.id,
      request_reason: reason,
      status: 'requested',
    })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await ctx.supabase.from('privacy_erasure_audit_events').insert({
    org_id: ctx.orgId,
    erasure_request_id: inserted?.id as string,
    user_id: targetUserId,
    actor_user_id: user.id,
    event_type: 'requested',
    reason,
  });

  return NextResponse.json({ ok: true, id: inserted?.id });
}
