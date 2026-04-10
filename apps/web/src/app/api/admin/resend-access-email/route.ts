import { sendOrgMemberAccessEmail } from '@/lib/admin/sendOrgMemberAccessEmail';
import { inviteCallbackUrl } from '@/lib/auth/inviteCallbackBaseUrl';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getSupabaseServiceRoleKey } from '@/lib/supabase/env';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  if (!getSupabaseServiceRoleKey()) {
    return NextResponse.json(
      { error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY for sending email.' },
      { status: 503 }
    );
  }

  const redirectTo = inviteCallbackUrl(req);
  if (!redirectTo) {
    return NextResponse.json(
      {
        error:
          'Set NEXT_PUBLIC_SITE_URL or SITE_URL so the email link can return to this app.',
      },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: me } = await supabase
    .from('profiles')
    .select('org_id, role, status')
    .eq('id', user.id)
    .maybeSingle();

  if (!me?.org_id || me.status !== 'active') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const orgId = me.org_id as string;
  const { data: canInvite, error: permErr } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: orgId,
    p_permission_key: 'members.invite',
    p_context: {},
  });
  if (permErr || !canInvite) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const userId =
    body && typeof body === 'object' && typeof (body as { user_id?: unknown }).user_id === 'string'
      ? (body as { user_id: string }).user_id.trim()
      : '';

  if (!userId || !UUID_RE.test(userId)) {
    return NextResponse.json({ error: 'Invalid user_id.' }, { status: 400 });
  }

  const { data: target, error: tErr } = await supabase
    .from('profiles')
    .select('id, email, org_id, full_name')
    .eq('id', userId)
    .maybeSingle();

  if (tErr || !target) {
    return NextResponse.json({ error: 'Member not found.' }, { status: 404 });
  }

  if ((target.org_id as string) !== orgId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const email = typeof target.email === 'string' ? target.email.trim().toLowerCase() : '';
  if (!email) {
    return NextResponse.json(
      { error: 'This member has no email on file; ask them to sign in and update profile if needed.' },
      { status: 400 }
    );
  }

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server misconfiguration';
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  const fullName = typeof target.full_name === 'string' ? target.full_name.trim() : '';
  const sent = await sendOrgMemberAccessEmail(admin, email, redirectTo, {
    ...(fullName ? { full_name: fullName } : {}),
  });

  if (!sent.ok) {
    return NextResponse.json({ error: sent.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    accessEmailChannel: sent.channel,
    sentAccessEmail: true,
  });
}
