import type { SupabaseClient } from '@supabase/supabase-js';

export type RawMobileBroadcast = {
  id: string;
  title: string;
  body: string;
  sent_at: string | null;
  dept_id: string;
  channel_id: string | null;
  team_id: string | null;
  created_by: string;
  is_mandatory: boolean;
  is_pinned: boolean;
  is_org_wide: boolean;
  cover_image_url: string | null;
};

export type MobileBroadcastRow = RawMobileBroadcast & {
  read: boolean;
  dept_name: string | null;
  channel_name: string | null;
  team_name: string | null;
  author_name: string | null;
};

export async function enrichMobileBroadcastRows(
  client: SupabaseClient,
  userId: string,
  raw: RawMobileBroadcast[],
): Promise<MobileBroadcastRow[]> {
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
    ...r,
    read: readSet.has(r.id),
    dept_name: dm.has(r.dept_id) ? dm.get(r.dept_id)! : null,
    channel_name: r.channel_id && cm.has(r.channel_id) ? cm.get(r.channel_id)! : null,
    team_name: r.team_id && tm.has(r.team_id) ? tm.get(r.team_id)! : null,
    author_name: pm.has(r.created_by) ? pm.get(r.created_by)! : null,
  }));
}
