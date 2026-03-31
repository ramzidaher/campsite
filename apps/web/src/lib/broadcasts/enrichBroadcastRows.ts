import type { SupabaseClient } from '@supabase/supabase-js';

import type { FeedRow, RawBroadcast } from './feedTypes';

let collabDepartmentsTableMissing = false;

function isMissingCollabDepartmentsTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; message?: string };
  const msg = (e.message ?? '').toLowerCase();
  return (
    e.code === '42P01' ||
    e.code === 'PGRST205' ||
    msg.includes('broadcast_collab_departments') ||
    msg.includes('does not exist')
  );
}

export async function enrichBroadcastRows(
  client: SupabaseClient,
  userId: string,
  raw: RawBroadcast[]
): Promise<FeedRow[]> {
  if (!raw.length) return [];
  const ids = raw.map((r) => r.id);
  const { data: reads } = await client
    .from('broadcast_reads')
    .select('broadcast_id')
    .eq('user_id', userId)
    .in('broadcast_id', ids);
  const readSet = new Set((reads ?? []).map((r) => r.broadcast_id as string));

  const deptIds = [...new Set(raw.map((r) => r.dept_id))];
  const channelIds = [
    ...new Set(raw.map((r) => r.channel_id).filter((id): id is string => Boolean(id))),
  ];
  const teamIds = [...new Set(raw.map((r) => r.team_id).filter((id): id is string => Boolean(id)))];
  const userIds = [...new Set(raw.map((r) => r.created_by))];
  let collabRows: { broadcast_id: string; dept_id: string }[] = [];
  if (!collabDepartmentsTableMissing) {
    const { data, error: collabRowsError } = await client
      .from('broadcast_collab_departments')
      .select('broadcast_id,dept_id')
      .in('broadcast_id', ids);
    if (collabRowsError && !isMissingCollabDepartmentsTableError(collabRowsError)) {
      throw collabRowsError;
    }
    if (collabRowsError && isMissingCollabDepartmentsTableError(collabRowsError)) {
      collabDepartmentsTableMissing = true;
    } else {
      collabRows = (data ?? []) as { broadcast_id: string; dept_id: string }[];
    }
  }
  const collabDeptIds = [...new Set((collabRows ?? []).map((r) => r.dept_id as string))];

  const [{ data: deps }, { data: chans }, { data: teams }, { data: profs }] = await Promise.all([
    client.from('departments').select('id,name').in('id', deptIds),
    channelIds.length
      ? client.from('broadcast_channels').select('id,name').in('id', channelIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    teamIds.length
      ? client.from('department_teams').select('id,name').in('id', teamIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    client.from('profiles').select('id,full_name').in('id', userIds),
  ]);
  const { data: collabDeps } = collabDeptIds.length
    ? await client.from('departments').select('id,name').in('id', collabDeptIds)
    : { data: [] as { id: string; name: string }[] };

  const dm = new Map((deps ?? []).map((d) => [d.id as string, d.name as string]));
  const cm = new Map((chans ?? []).map((c) => [c.id as string, c.name as string]));
  const tm = new Map((teams ?? []).map((t) => [t.id as string, t.name as string]));
  const pm = new Map((profs ?? []).map((p) => [p.id as string, p.full_name as string]));
  const collabDeptMap = new Map((collabDeps ?? []).map((d) => [d.id as string, d.name as string]));
  const collabByBroadcast = new Map<string, string[]>();
  for (const row of collabRows ?? []) {
    const bId = row.broadcast_id as string;
    const dId = row.dept_id as string;
    const list = collabByBroadcast.get(bId) ?? [];
    list.push(dId);
    collabByBroadcast.set(bId, list);
  }

  return raw.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    sent_at: r.sent_at,
    dept_id: r.dept_id,
    channel_id: r.channel_id,
    team_id: r.team_id ?? null,
    created_by: r.created_by,
    is_mandatory: r.is_mandatory ?? false,
    is_pinned: r.is_pinned ?? false,
    is_org_wide: r.is_org_wide ?? false,
    departments: dm.has(r.dept_id) ? { name: dm.get(r.dept_id)! } : null,
    broadcast_channels:
      r.channel_id && cm.has(r.channel_id) ? { name: cm.get(r.channel_id)! } : null,
    department_teams: r.team_id && tm.has(r.team_id) ? { name: tm.get(r.team_id)! } : null,
    collab_departments: (collabByBroadcast.get(r.id) ?? [])
      .map((id) => ({ id, name: collabDeptMap.get(id) ?? 'Department' })),
    profiles: pm.has(r.created_by) ? { full_name: pm.get(r.created_by)! } : null,
    read: readSet.has(r.id),
  }));
}
