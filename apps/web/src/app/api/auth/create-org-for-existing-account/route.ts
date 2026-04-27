import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

type Body = {
  org_name?: string;
  org_slug?: string;
  org_logo_url?: string;
  legal_bundle_version?: string;
  legal_host?: string;
  legal_path?: string;
  legal_user_agent?: string;
  full_name?: string;
};

function normalizeSlug(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user?.id || !user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const orgName = String(body.org_name ?? '').trim();
  const orgSlug = normalizeSlug(String(body.org_slug ?? '').trim());
  const orgLogoUrlRaw = String(body.org_logo_url ?? '').trim();
  const fullName = String(body.full_name ?? '').trim() || user.email.split('@')[0] || 'Member';
  const legalBundle = String(body.legal_bundle_version ?? '').trim();
  const legalHost = String(body.legal_host ?? '').trim() || null;
  const legalPath = String(body.legal_path ?? '').trim() || null;
  const legalUserAgent = String(body.legal_user_agent ?? '').trim() || null;

  if (!orgName || orgName.length > 120) {
    return NextResponse.json({ error: 'Organisation name must be between 1 and 120 characters.' }, { status: 400 });
  }
  if (!orgSlug || orgSlug.length < 2 || orgSlug.length > 63 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(orgSlug)) {
    return NextResponse.json({ error: 'Choose a valid organisation slug.' }, { status: 400 });
  }

  const orgLogoUrl = (() => {
    if (!orgLogoUrlRaw) return null;
    if (orgLogoUrlRaw.length > 2048) return null;
    try {
      const u = new URL(orgLogoUrlRaw);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      return orgLogoUrlRaw;
    } catch {
      return null;
    }
  })();

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server misconfiguration';
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  const { data: existingOrg } = await admin
    .from('organisations')
    .select('id')
    .eq('slug', orgSlug)
    .maybeSingle();
  if (existingOrg?.id) {
    return NextResponse.json({ error: 'That organisation URL is already taken. Choose a different slug.' }, { status: 409 });
  }

  const { data: orgRow, error: orgErr } = await admin
    .from('organisations')
    .insert({ name: orgName, slug: orgSlug, logo_url: orgLogoUrl, is_active: true })
    .select('id, slug')
    .single();
  if (orgErr || !orgRow?.id) {
    return NextResponse.json({ error: orgErr?.message ?? 'Could not create organisation.' }, { status: 500 });
  }

  const { data: deptRow, error: deptErr } = await admin
    .from('departments')
    .insert({ org_id: orgRow.id, name: 'General', type: 'department', is_archived: false })
    .select('id')
    .single();
  if (deptErr || !deptRow?.id) {
    return NextResponse.json({ error: deptErr?.message ?? 'Could not create default department.' }, { status: 500 });
  }

  const { error: membershipErr } = await admin.from('user_org_memberships').upsert(
    {
      user_id: user.id,
      org_id: orgRow.id,
      full_name: fullName,
      email: user.email,
      role: 'org_admin',
      status: 'active',
    },
    { onConflict: 'user_id,org_id' }
  );
  if (membershipErr) {
    return NextResponse.json({ error: membershipErr.message }, { status: 500 });
  }

  const { error: deptMembershipErr } = await admin
    .from('user_departments')
    .upsert({ user_id: user.id, dept_id: deptRow.id }, { onConflict: 'user_id,dept_id' });
  if (deptMembershipErr) {
    return NextResponse.json({ error: deptMembershipErr.message }, { status: 500 });
  }

  const { error: switchErr } = await supabase.rpc('set_my_active_org', { p_org_id: orgRow.id });
  if (switchErr) {
    return NextResponse.json({ error: switchErr.message }, { status: 500 });
  }

  if (legalBundle) {
    await admin.rpc('record_legal_acceptance_event', {
      p_user_id: user.id,
      p_actor_user_id: user.id,
      p_org_id: orgRow.id,
      p_email: user.email,
      p_bundle_version: legalBundle.slice(0, 256),
      p_accepted_at: new Date().toISOString(),
      p_acceptance_source: 'registration_existing_account',
      p_request_host: legalHost,
      p_request_path: legalPath,
      p_user_agent: legalUserAgent ? legalUserAgent.slice(0, 2048) : null,
      p_evidence: { flow: 'create_org_existing_account' },
    });
  }

  await admin.from('org_membership_audit_events').insert({
    org_id: orgRow.id,
    actor_user_id: user.id,
    target_user_id: user.id,
    event_type: 'membership_provisioned',
    source: 'create_org_for_existing_account',
    payload: {
      role: 'org_admin',
      default_department_id: deptRow.id,
      org_slug: orgRow.slug,
    },
  });

  return NextResponse.json({ ok: true, org_slug: orgRow.slug });
}

