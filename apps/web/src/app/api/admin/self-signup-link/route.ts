import { randomBytes, createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: me } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .maybeSingle();
  if (!me?.org_id || me.status !== 'active') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: canInvite, error: invitePermErr } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: me.org_id,
    p_permission_key: 'members.invite',
    p_context: {},
  });
  if (invitePermErr || !canInvite) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: orgRow, error: orgErr } = await supabase
    .from('organisations')
    .select('id, slug')
    .eq('id', me.org_id)
    .maybeSingle();
  if (orgErr || !orgRow?.slug) {
    return NextResponse.json({ error: 'Organisation not found.' }, { status: 400 });
  }

  const token = randomBytes(32).toString('hex');
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Server misconfiguration';
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const { error: insertErr } = await admin.from('org_signup_invite_tokens').insert({
    org_id: orgRow.id,
    token_hash: tokenHash,
    created_by: user.id,
    expires_at: expiresAt,
    max_uses: null,
  });
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  const signupUrl = new URL('/register', req.nextUrl.origin);
  signupUrl.searchParams.set('org', orgRow.slug);
  signupUrl.searchParams.set('invite', token);

  return NextResponse.json({ ok: true, url: signupUrl.toString(), expires_at: expiresAt });
}

