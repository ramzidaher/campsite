import { BroadcastDetailView } from '@/components/broadcasts/BroadcastDetailView';
import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';

export default async function BroadcastDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Core row only (no embeds): avoids PostgREST/nested-resource edge cases where
  // relation resolution could affect the payload; cover_image_url is always from this select.
  const { data: b, error } = await supabase
    .from('broadcasts')
    .select(
      'id, org_id, title, body, status, sent_at, is_mandatory, is_pinned, is_org_wide, cover_image_url, dept_id, channel_id, team_id, created_by'
    )
    .eq('id', id)
    .single();

  if (error || !b) notFound();

  const deptId = b.dept_id as string;
  const channelId = b.channel_id as string | null;
  const teamId = b.team_id as string | null;
  const createdBy = b.created_by as string;

  const [deptRes, channelRes, teamRes, senderRes, maySetCoverRes] = await Promise.all([
    supabase.from('departments').select('name').eq('id', deptId).maybeSingle(),
    channelId
      ? supabase.from('broadcast_channels').select('name').eq('id', channelId).maybeSingle()
      : Promise.resolve({ data: null as { name: string } | null }),
    teamId
      ? supabase.from('department_teams').select('name').eq('id', teamId).maybeSingle()
      : Promise.resolve({ data: null as { name: string } | null }),
    supabase.from('profiles').select('full_name').eq('id', createdBy).maybeSingle(),
    supabase.rpc('broadcast_may_set_cover', { p_broadcast_id: id }),
  ]);

  const maySetCover = maySetCoverRes.data;
  const dept = deptRes.data;
  const channel = channelRes.data;
  const team = teamRes.data;
  const sender = senderRes.data;

  return (
    <BroadcastDetailView
      userId={user.id}
      canSetCover={maySetCover === true}
      initial={{
        id: b.id as string,
        org_id: b.org_id as string,
        title: b.title as string,
        body: b.body as string,
        status: b.status as string,
        sent_at: b.sent_at as string | null,
        is_mandatory: Boolean(b.is_mandatory),
        is_pinned: Boolean(b.is_pinned),
        is_org_wide: Boolean(b.is_org_wide),
        cover_image_url: (b.cover_image_url as string | null) ?? null,
        departments: dept ? { name: dept.name as string } : null,
        broadcast_channels: channel ? { name: channel.name as string } : null,
        department_teams: team ? { name: team.name as string } : null,
        profiles: sender ? { full_name: sender.full_name as string } : null,
      }}
    />
  );
}
