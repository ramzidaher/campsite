import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

type Body = { join_request_id?: string };

export async function POST(req: NextRequest) {
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
  const joinRequestId = String(body.join_request_id ?? '').trim();
  if (!joinRequestId) {
    return NextResponse.json({ error: 'Missing join request id.' }, { status: 400 });
  }

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Server misconfiguration';
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const { data: reqRow, error: reqErr } = await admin
    .from('org_membership_join_requests')
    .select('id, org_id, email_lower, full_name, dept_ids, status, expires_at, consumed_by')
    .eq('id', joinRequestId)
    .maybeSingle();
  if (reqErr || !reqRow) {
    return NextResponse.json({ error: 'Join request not found.' }, { status: 404 });
  }

  const isExpired = reqRow.expires_at <= new Date().toISOString();
  if (reqRow.status !== 'pending' || isExpired) {
    if (reqRow.status === 'pending' && isExpired) {
      await admin
        .from('org_membership_join_requests')
        .update({ status: 'expired' })
        .eq('id', reqRow.id);
    }
    return NextResponse.json({ error: 'Join request is no longer valid.' }, { status: 410 });
  }

  const userEmailLower = user.email.trim().toLowerCase();
  if (reqRow.email_lower !== userEmailLower) {
    return NextResponse.json({ error: 'Join request does not match this account.' }, { status: 403 });
  }

  const deptIds = Array.isArray(reqRow.dept_ids)
    ? (reqRow.dept_ids.filter((v): v is string => typeof v === 'string') as string[])
    : [];
  if (deptIds.length) {
    const { data: deptRows } = await admin
      .from('departments')
      .select('id')
      .eq('org_id', reqRow.org_id)
      .eq('is_archived', false)
      .in('id', deptIds);
    const valid = new Set((deptRows ?? []).map((d) => d.id as string));
    for (let i = deptIds.length - 1; i >= 0; i -= 1) {
      if (!valid.has(deptIds[i]!)) deptIds.splice(i, 1);
    }
  }

  const { data: existingMembership } = await admin
    .from('user_org_memberships')
    .select('status')
    .eq('user_id', user.id)
    .eq('org_id', reqRow.org_id)
    .maybeSingle();
  const nextStatus =
    existingMembership?.status === 'active' || existingMembership?.status === 'inactive'
      ? existingMembership.status
      : 'pending';

  const { error: upsertMembershipErr } = await admin.from('user_org_memberships').upsert(
    {
      user_id: user.id,
      org_id: reqRow.org_id,
      full_name: reqRow.full_name,
      email: user.email,
      role: 'unassigned',
      status: nextStatus,
    },
    { onConflict: 'user_id,org_id' }
  );
  if (upsertMembershipErr) {
    return NextResponse.json({ error: upsertMembershipErr.message }, { status: 500 });
  }

  const { data: profileRow } = await admin.from('profiles').select('id').eq('id', user.id).maybeSingle();
  if (!profileRow) {
    const { error: createProfileErr } = await admin.from('profiles').insert({
      id: user.id,
      org_id: reqRow.org_id,
      full_name: reqRow.full_name,
      email: user.email,
      role: 'unassigned',
      status: nextStatus,
    });
    if (createProfileErr) {
      return NextResponse.json({ error: createProfileErr.message }, { status: 500 });
    }
  }

  const { data: allOrgDeptRows } = await admin
    .from('departments')
    .select('id')
    .eq('org_id', reqRow.org_id);
  const allOrgDeptIds = (allOrgDeptRows ?? []).map((d) => d.id as string).filter(Boolean);
  if (allOrgDeptIds.length) {
    await admin
      .from('user_departments')
      .delete()
      .eq('user_id', user.id)
      .in('dept_id', allOrgDeptIds);
  }

  if (deptIds.length) {
    await admin.from('user_departments').insert(deptIds.map((deptId) => ({ user_id: user.id, dept_id: deptId })));
  }

  await admin
    .from('org_membership_join_requests')
    .update({
      status: 'consumed',
      consumed_at: new Date().toISOString(),
      consumed_by: user.id,
    })
    .eq('id', reqRow.id);

  await admin.from('org_membership_audit_events').insert({
    org_id: reqRow.org_id,
    actor_user_id: user.id,
    target_user_id: user.id,
    event_type: 'membership_join_completed',
    source: 'complete_org_join',
    payload: {
      join_request_id: reqRow.id,
      department_count: deptIds.length,
    },
  });

  return NextResponse.json({ ok: true });
}

