import type { SupabaseClient } from '@supabase/supabase-js';

import type { FeedRow, RawBroadcast } from './feedTypes';

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

  const dm = new Map((deps ?? []).map((d) => [d.id as string, d.name as string]));
  const cm = new Map((chans ?? []).map((c) => [c.id as string, c.name as string]));
  const tm = new Map((teams ?? []).map((t) => [t.id as string, t.name as string]));
  const pm = new Map((profs ?? []).map((p) => [p.id as string, p.full_name as string]));

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
    profiles: pm.has(r.created_by) ? { full_name: pm.get(r.created_by)! } : null,
    read: readSet.has(r.id),
  }));
}
