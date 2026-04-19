import { BroadcastDetailView } from '@/components/broadcasts/BroadcastDetailView';
import type { BroadcastReplyRow } from '@/components/broadcasts/BroadcastRepliesClient';
import { parseBroadcastFeedNavigation } from '@/lib/broadcasts/parseBroadcastFeedNavigation';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function BroadcastDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getAuthUser();
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
  const broadcastOrgId = b.org_id as string;
  const status = b.status as string;

  const [
    permissionKeys,
    deptRes,
    channelRes,
    teamRes,
    senderRes,
    maySetCoverRes,
    navRes,
    mayEditRes,
    repliesRes,
  ] = await Promise.all([
    getMyPermissions(broadcastOrgId),
    supabase.from('departments').select('name').eq('id', deptId).maybeSingle(),
    channelId
      ? supabase.from('broadcast_channels').select('name').eq('id', channelId).maybeSingle()
      : Promise.resolve({ data: null as { name: string } | null }),
    teamId
      ? supabase.from('department_teams').select('name').eq('id', teamId).maybeSingle()
      : Promise.resolve({ data: null as { name: string } | null }),
    supabase.from('profiles').select('full_name').eq('id', createdBy).maybeSingle(),
    supabase.rpc('broadcast_may_set_cover', { p_broadcast_id: id }),
    status === 'sent' ? supabase.rpc('broadcast_feed_navigation', { p_broadcast_id: id }) : Promise.resolve({ data: null }),
    supabase.rpc('broadcast_may_edit_content', { p_broadcast_id: id }),
    status === 'sent'
      ? supabase
          .from('broadcast_replies')
          .select('id, body, visibility, created_at, author_id')
          .eq('broadcast_id', id)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] as { id: string; body: string; visibility: string; created_at: string; author_id: string }[] }),
  ]);

  const maySetCover = maySetCoverRes.data;
  const dept = deptRes.data;
  const channel = channelRes.data;
  const team = teamRes.data;
  const sender = senderRes.data;

  const navigation =
    status === 'sent' ? parseBroadcastFeedNavigation(navRes.data) : null;

  let initialReplies: BroadcastReplyRow[] | null = null;
  if (status === 'sent') {
    const raw = repliesRes.data ?? [];
    if (raw.length > 0) {
      const authorIds = [...new Set(raw.map((r) => r.author_id as string))];
      const { data: names } = await supabase.from('profiles').select('id, full_name').in('id', authorIds);
      const nm = new Map((names ?? []).map((p) => [p.id as string, (p.full_name as string) ?? null]));
      initialReplies = raw.map((r) => ({
        id: r.id as string,
        body: r.body as string,
        visibility: r.visibility as 'private_to_author' | 'org_thread',
        created_at: r.created_at as string,
        author_id: r.author_id as string,
        author_name: nm.get(r.author_id as string) ?? null,
      }));
    } else {
      initialReplies = [];
    }
  }

  return (
    <BroadcastDetailView
      userId={user.id}
      orgId={broadcastOrgId}
      showAdminChannelNote={permissionKeys.includes('broadcasts.publish_without_approval')}
      canSetCover={maySetCover === true}
      navigation={navigation}
      mayEdit={mayEditRes.data === true}
      initialReplies={initialReplies}
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
        dept_id: deptId,
        channel_id: channelId,
        created_by: createdBy,
        departments: dept ? { name: dept.name as string } : null,
        broadcast_channels: channel ? { name: channel.name as string } : null,
        department_teams: team ? { name: team.name as string } : null,
        profiles: sender ? { full_name: sender.full_name as string } : null,
      }}
    />
  );
}
