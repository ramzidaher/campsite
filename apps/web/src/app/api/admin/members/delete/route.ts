import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function collectDeleteBlockers(admin: ReturnType<typeof createServiceRoleClient>, userId: string): Promise<string[]> {
  const checks: Array<{ table: string; column: string }> = [
    { table: 'onboarding_templates', column: 'created_by' },
    { table: 'onboarding_runs', column: 'started_by' },
    { table: 'recruitment_requests', column: 'created_by' },
    { table: 'recruitment_request_history', column: 'changed_by' },
    { table: 'interview_slots', column: 'created_by' },
    { table: 'offer_letter_templates', column: 'created_by' },
    { table: 'offer_letters', column: 'created_by' },
    { table: 'job_listings', column: 'created_by' },
    { table: 'job_application_notes', column: 'created_by' },
    { table: 'job_application_status_history', column: 'created_by' },
    { table: 'employee_hr_records', column: 'created_by' },
    { table: 'employee_hr_audit_log', column: 'changed_by' },
    { table: 'review_cycles', column: 'created_by' },
  ];
  const blockers: string[] = [];
  for (const c of checks) {
    const { count, error } = await admin.from(c.table).select('id', { count: 'exact', head: true }).eq(c.column, userId);
    if (error) {
      blockers.push(`${c.table}.${c.column}=query_error(${error.message})`);
      continue;
    }
    if ((count ?? 0) > 0) blockers.push(`${c.table}.${c.column}=${count}`);
  }
  return blockers;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: me } = await supabase.from('profiles').select('org_id, status').eq('id', user.id).maybeSingle();
  if (!me?.org_id || me.status !== 'active') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: canRemoveMembers } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: me.org_id,
    p_permission_key: 'members.remove',
    p_context: {},
  });
  if (!canRemoveMembers) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { user_id?: string } | null;
  const targetUserId = body?.user_id?.trim() ?? '';
  if (!UUID_RE.test(targetUserId)) {
    return NextResponse.json({ error: 'A valid user_id is required' }, { status: 400 });
  }
  if (targetUserId === user.id) {
    return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 });
  }

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server misconfiguration';
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  const { data: target, error: targetErr } = await admin
    .from('profiles')
    .select('id, org_id, role, status')
    .eq('id', targetUserId)
    .maybeSingle();
  if (targetErr) return NextResponse.json({ error: targetErr.message }, { status: 500 });
  if (!target || (target.org_id as string | null) !== me.org_id) {
    return NextResponse.json({ error: 'User is not a member of this organisation.' }, { status: 404 });
  }
  if ((target.status as string) !== 'inactive') {
    return NextResponse.json({ error: 'Only inactive users can be deleted.' }, { status: 400 });
  }

  const { data: founderRow, error: founderErr } = await admin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', targetUserId)
    .maybeSingle();
  if (founderErr) return NextResponse.json({ error: founderErr.message }, { status: 500 });
  if (founderRow) {
    return NextResponse.json({ error: 'Founder HQ users cannot be deleted from organisation admin.' }, { status: 400 });
  }

  if ((target.role as string) === 'org_admin' || (target.role as string) === 'super_admin') {
    const { count, error: countErr } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', me.org_id)
      .in('role', ['org_admin', 'super_admin']);
    if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });
    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: 'Cannot delete the last org admin for this organisation.' }, { status: 400 });
    }
  }

  const { error: deleteErr } = await admin.auth.admin.deleteUser(targetUserId);
  if (deleteErr) {
    const blockers = await collectDeleteBlockers(admin, targetUserId);
    const blockerText = blockers.length ? ` Potential blockers: ${blockers.join(', ')}.` : '';
    console.error('[admin] delete member user failed', {
      orgId: me.org_id,
      actorUserId: user.id,
      targetUserId,
      error: deleteErr.message,
      blockers,
    });
    return NextResponse.json({ error: `${deleteErr.message}.${blockerText}` }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
