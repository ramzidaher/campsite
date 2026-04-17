import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function getCtx(userId: string) {
  const supabase = await createClient();
  const { data: profile } = await supabase.from('profiles').select('org_id, status').eq('id', userId).maybeSingle();
  if (!profile?.org_id || profile.status !== 'active') return null;
  return { supabase, orgId: profile.org_id as string };
}

export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const ctx = await getCtx(user.id);
  if (!ctx) return NextResponse.json({ error: 'No active org profile' }, { status: 403 });
  const { supabase, orgId } = ctx;
  const { searchParams } = new URL(request.url);
  const requestedUserId = searchParams.get('userId') || user.id;

  const { data, error } = await supabase
    .from('employee_training_records')
    .select(
      'id, title, provider, status, started_on, completed_on, expires_on, notes, certificate_document_url, created_at'
    )
    .eq('org_id', orgId)
    .eq('user_id', requestedUserId)
    .order('created_at', { ascending: false })
    .limit(120);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ rows: data ?? [] });
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const ctx = await getCtx(user.id);
  if (!ctx) return NextResponse.json({ error: 'No active org profile' }, { status: 403 });
  const { supabase, orgId } = ctx;
  const body = await request.json().catch(() => ({}));
  const targetUserId = clean(body.user_id) || user.id;
  const title = clean(body.title);
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });

  const { error } = await supabase.from('employee_training_records').insert({
    org_id: orgId,
    user_id: targetUserId,
    title,
    provider: clean(body.provider) || null,
    status: clean(body.status) || 'planned',
    started_on: clean(body.started_on) || null,
    completed_on: clean(body.completed_on) || null,
    expires_on: clean(body.expires_on) || null,
    notes: clean(body.notes) || null,
    certificate_document_url: clean(body.certificate_document_url) || null,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
