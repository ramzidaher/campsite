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
  const catIds = [...new Set(raw.map((r) => r.cat_id))];
  const userIds = [...new Set(raw.map((r) => r.created_by))];

  const [{ data: deps }, { data: cats }, { data: profs }] = await Promise.all([
    client.from('departments').select('id,name').in('id', deptIds),
    client.from('dept_categories').select('id,name').in('id', catIds),
    client.from('profiles').select('id,full_name').in('id', userIds),
  ]);

  const dm = new Map((deps ?? []).map((d) => [d.id as string, d.name as string]));
  const cm = new Map((cats ?? []).map((c) => [c.id as string, c.name as string]));
  const pm = new Map((profs ?? []).map((p) => [p.id as string, p.full_name as string]));

  return raw.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    sent_at: r.sent_at,
    dept_id: r.dept_id,
    cat_id: r.cat_id,
    created_by: r.created_by,
    is_mandatory: r.is_mandatory ?? false,
    is_pinned: r.is_pinned ?? false,
    is_org_wide: r.is_org_wide ?? false,
    departments: dm.has(r.dept_id) ? { name: dm.get(r.dept_id)! } : null,
    dept_categories: cm.has(r.cat_id) ? { name: cm.get(r.cat_id)! } : null,
    profiles: pm.has(r.created_by) ? { full_name: pm.get(r.created_by)! } : null,
    read: readSet.has(r.id),
  }));
}
