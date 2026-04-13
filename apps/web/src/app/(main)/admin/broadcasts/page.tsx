import {
  AdminBroadcastsClient,
  type AdminBroadcastRow,
} from '@/components/admin/AdminBroadcastsClient';
import { createClient } from '@/lib/supabase/server';
import { hasPermission } from '@/lib/adminGates';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function AdminBroadcastsPage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role, status')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  const { data: perms } = await supabase.rpc('get_my_permissions', { p_org_id: profile.org_id });
  const permissionKeys = ((perms ?? []) as Array<{ permission_key?: string }>).map((p) => String(p.permission_key ?? ''));
  if (!hasPermission(permissionKeys, 'broadcasts.view')) redirect('/admin');

  const { data: rows } = await supabase
    .from('broadcasts')
    .select(
      `id, title, status, scheduled_at, sent_at, created_at, dept_id, channel_id, is_org_wide, team_id,
       departments(name), broadcast_channels(name), department_teams(name),
       sender:profiles!broadcasts_created_by_fkey(full_name)`
    )
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: false })
    .limit(200);

  const ids = (rows ?? []).map((r) => r.id as string);
  const readCountByBroadcast: Record<string, number> = {};
  if (ids.length) {
    const { data: reads } = await supabase.from('broadcast_reads').select('broadcast_id').in('broadcast_id', ids);
    for (const x of reads ?? []) {
      const bid = x.broadcast_id as string;
      readCountByBroadcast[bid] = (readCountByBroadcast[bid] ?? 0) + 1;
    }
  }

  const { data: departments } = await supabase
    .from('departments')
    .select('id, name')
    .eq('org_id', profile.org_id)
    .eq('is_archived', false);

  const { data: categories } = await supabase
    .from('broadcast_channels')
    .select('id, name, dept_id')
    .in(
      'dept_id',
      (departments ?? []).map((d) => d.id as string)
    );

  return (
    <AdminBroadcastsClient
      initialRows={(rows ?? []) as AdminBroadcastRow[]}
      readCountByBroadcast={readCountByBroadcast}
      departments={(departments ?? []) as { id: string; name: string }[]}
      categories={(categories ?? []) as { id: string; name: string; dept_id: string }[]}
    />
  );
}
