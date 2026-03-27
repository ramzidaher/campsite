import { canManageOrgUsers } from '@/lib/adminGates';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getSupabaseServiceRoleKey } from '@/lib/supabase/env';
import { rolesAssignableOnApprove, type ProfileRole } from '@campsite/types';
import { NextRequest, NextResponse } from 'next/server';

const LOCALHOST_SITE_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

function trimBaseUrl(raw: string | undefined): string | null {
  const t = raw?.trim().replace(/\/$/, '');
  return t?.length ? t : null;
}

/**
 * Base URL for Supabase invite `redirectTo`. Must match Supabase → Auth → Redirect URLs.
 * On Vercel, a local `NEXT_PUBLIC_SITE_URL` from dev often gets baked into builds — we skip
 * localhost there and use `VERCEL_URL` or the incoming request host instead.
 */
function inviteCallbackBaseUrl(req: NextRequest): string | null {
  const siteUrl = trimBaseUrl(process.env.SITE_URL);
  const nextPublic = trimBaseUrl(process.env.NEXT_PUBLIC_SITE_URL);
  const onVercel = process.env.VERCEL === '1';
  const vercelHost = trimBaseUrl(process.env.VERCEL_URL);

  if (siteUrl) return siteUrl;

  if (nextPublic) {
    const isLocal = LOCALHOST_SITE_RE.test(nextPublic);
    if (!(isLocal && onVercel)) return nextPublic;
  }

  if (vercelHost) {
    return `https://${vercelHost}`;
  }

  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  if (!host) return null;
  return `${proto}://${host}`;
}

function inviteCallbackUrl(req: NextRequest): string | null {
  const base = inviteCallbackBaseUrl(req);
  const next = encodeURIComponent('/dashboard');
  const path = `/auth/callback?next=${next}`;
  if (!base) return null;
  return `${base}${path}`;
}

function isAlreadyRegisteredInviteError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('already') ||
    m.includes('registered') ||
    m.includes('exists') ||
    m.includes('duplicate')
  );
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  if (!getSupabaseServiceRoleKey()) {
    return NextResponse.json(
      {
        error:
          'Email invites need SUPABASE_SERVICE_ROLE_KEY on the server (never expose it to the browser). Add it in .env for this app.',
      },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: me } = await supabase
    .from('profiles')
    .select('org_id, role, status')
    .eq('id', user.id)
    .maybeSingle();

  if (!me?.org_id || me.status !== 'active' || !canManageOrgUsers(me.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const orgId = me.org_id as string;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  const fullName = typeof b.full_name === 'string' ? b.full_name.trim() : '';
  const role = typeof b.role === 'string' ? b.role.trim() : '';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }
  if (!fullName || fullName.length > 200) {
    return NextResponse.json({ error: 'Enter a name (max 200 characters).' }, { status: 400 });
  }

  const allowed = new Set(rolesAssignableOnApprove('org_admin') as ProfileRole[]);
  if (!allowed.has(role as ProfileRole)) {
    return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
  }

  let deptIds: string[] = [];
  if (b.department_ids !== undefined && b.department_ids !== null) {
    if (!Array.isArray(b.department_ids)) {
      return NextResponse.json({ error: 'department_ids must be an array.' }, { status: 400 });
    }
    const raw = b.department_ids.filter((x): x is string => typeof x === 'string');
    deptIds = [...new Set(raw.map((x) => x.trim()).filter(Boolean))];
    for (const id of deptIds) {
      if (!UUID_RE.test(id)) {
        return NextResponse.json({ error: 'Invalid department id.' }, { status: 400 });
      }
    }
  }

  if (deptIds.length) {
    const { data: okRows, error: deptErr } = await supabase
      .from('departments')
      .select('id')
      .eq('org_id', orgId)
      .eq('is_archived', false)
      .in('id', deptIds);
    if (deptErr) {
      return NextResponse.json({ error: deptErr.message }, { status: 400 });
    }
    if ((okRows ?? []).length !== deptIds.length) {
      return NextResponse.json(
        { error: 'One or more departments are not in your organisation.' },
        { status: 400 }
      );
    }
  }

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server misconfiguration';
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  const deptArray = deptIds.length ? deptIds : [];

  const redirectTo = inviteCallbackUrl(req);

  let targetUserId: string | null = null;
  let sentInviteEmail = false;

  if (redirectTo) {
    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName, must_set_password: true },
      redirectTo,
    });

    if (!inviteErr && invited?.user?.id) {
      targetUserId = invited.user.id;
      sentInviteEmail = true;
    } else if (inviteErr && !isAlreadyRegisteredInviteError(inviteErr.message)) {
      return NextResponse.json({ error: inviteErr.message }, { status: 400 });
    }
  }

  if (!targetUserId) {
    const { data: existingId, error: lookErr } = await admin.rpc('admin_find_auth_user_id_by_email', {
      p_email: email,
    });
    if (lookErr) {
      return NextResponse.json({ error: lookErr.message }, { status: 500 });
    }
    const id = typeof existingId === 'string' ? existingId : null;
    if (!id || !UUID_RE.test(id)) {
      if (!redirectTo) {
        return NextResponse.json(
          {
            error:
              'That email is not registered yet. Set NEXT_PUBLIC_SITE_URL (e.g. http://localhost:3000) so invite emails can link back to this app, or share the self-signup link instead.',
          },
          { status: 400 }
        );
      }
      return NextResponse.json(
        {
          error:
            'That email looks registered, but we could not look it up in Auth. Check Supabase → Authentication → Users.',
        },
        { status: 500 }
      );
    }
    targetUserId = id;
  }

  if (!targetUserId) {
    return NextResponse.json({ error: 'Could not determine user for this invite.' }, { status: 500 });
  }

  const { error: rpcErr } = await admin.rpc('admin_provision_invited_member', {
    p_user_id: targetUserId,
    p_org_id: orgId,
    p_full_name: fullName,
    p_role: role,
    p_dept_ids: deptArray,
  });

  if (rpcErr) {
    if (sentInviteEmail) {
      const { error: delErr } = await admin.auth.admin.deleteUser(targetUserId);
      if (delErr) {
        console.error(
          'invite-member: provision failed and deleteUser failed',
          rpcErr.message,
          delErr.message
        );
      }
    }
    const lower = rpcErr.message.toLowerCase();
    const status = lower.includes('another organisation') ? 409 : 500;
    return NextResponse.json({ error: rpcErr.message || 'Could not finish setting up this member.' }, { status });
  }

  return NextResponse.json({ ok: true, sentInviteEmail });
}
