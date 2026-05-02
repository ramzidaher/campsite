import { cache } from 'react';

import type { BroadcastReplyRow } from '@/components/broadcasts/BroadcastRepliesClient';
import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { parseBroadcastFeedNavigation } from '@/lib/broadcasts/parseBroadcastFeedNavigation';
import { createClient } from '@/lib/supabase/server';

type BroadcastDetailInitial = {
  id: string;
  org_id: string;
  title: string;
  body: string;
  status: string;
  sent_at: string | null;
  is_mandatory: boolean;
  is_pinned: boolean;
  is_org_wide: boolean;
  cover_image_url: string | null;
  dept_id: string;
  channel_id: string | null;
  created_by: string;
  departments: { name: string } | null;
  broadcast_channels: { name: string } | null;
  department_teams: { name: string } | null;
  profiles: { full_name: string } | null;
};

export type BroadcastDetailPageData = {
  initial: BroadcastDetailInitial;
  mayEdit: boolean;
  canSetCover: boolean;
  navigation: ReturnType<typeof parseBroadcastFeedNavigation>;
  initialReplies: BroadcastReplyRow[] | null;
};

const BROADCAST_DETAIL_PAGE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_BROADCAST_DETAIL_PAGE_RESPONSE_CACHE_TTL_MS ?? '15000',
  10
);

const broadcastDetailPageResponseCache = new Map<string, TtlCacheEntry<BroadcastDetailPageData | null>>();
const broadcastDetailPageInFlight = new Map<string, Promise<BroadcastDetailPageData | null>>();
registerSharedCacheStore('campsite:broadcasts:detail', broadcastDetailPageResponseCache, broadcastDetailPageInFlight);

function getBroadcastDetailPageCacheKey(orgId: string, viewerUserId: string, broadcastId: string): string {
  return `org:${orgId}:viewer:${viewerUserId}:broadcast:${broadcastId}`;
}

export const getCachedBroadcastDetailPageData = cache(
  async (orgId: string, viewerUserId: string, broadcastId: string): Promise<BroadcastDetailPageData | null> => {
    return getOrLoadSharedCachedValue({
      cache: broadcastDetailPageResponseCache,
      inFlight: broadcastDetailPageInFlight,
      key: getBroadcastDetailPageCacheKey(orgId, viewerUserId, broadcastId),
      cacheNamespace: 'campsite:broadcasts:detail',
      ttlMs: BROADCAST_DETAIL_PAGE_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();
        const { data: b, error } = await supabase
          .from('broadcasts')
          .select(
            'id, org_id, title, body, status, sent_at, is_mandatory, is_pinned, is_org_wide, cover_image_url, dept_id, channel_id, team_id, created_by'
          )
          .eq('id', broadcastId)
          .single();
        if (error || !b) return null;
        const broadcastOrgId = String(b.org_id ?? '');
        if (!broadcastOrgId || broadcastOrgId !== orgId) return null;

        const deptId = String(b.dept_id ?? '');
        const channelId = (b.channel_id as string | null) ?? null;
        const teamId = (b.team_id as string | null) ?? null;
        const createdBy = String(b.created_by ?? '');
        const status = String(b.status ?? '');

        const [deptRes, channelRes, teamRes, senderRes, maySetCoverRes, navRes, mayEditRes, repliesRes] = await Promise.all([
          supabase.from('departments').select('name').eq('id', deptId).maybeSingle(),
          channelId
            ? supabase.from('broadcast_channels').select('name').eq('id', channelId).maybeSingle()
            : Promise.resolve({ data: null as { name: string } | null }),
          teamId
            ? supabase.from('department_teams').select('name').eq('id', teamId).maybeSingle()
            : Promise.resolve({ data: null as { name: string } | null }),
          supabase.from('profiles').select('full_name').eq('id', createdBy).maybeSingle(),
          supabase.rpc('broadcast_may_set_cover', { p_broadcast_id: broadcastId }),
          status === 'sent' ? supabase.rpc('broadcast_feed_navigation', { p_broadcast_id: broadcastId }) : Promise.resolve({ data: null }),
          supabase.rpc('broadcast_may_edit_content', { p_broadcast_id: broadcastId }),
          status === 'sent'
            ? supabase
                .from('broadcast_replies')
                .select('id, body, visibility, created_at, author_id')
                .eq('broadcast_id', broadcastId)
                .order('created_at', { ascending: true })
            : Promise.resolve({ data: [] as { id: string; body: string; visibility: string; created_at: string; author_id: string }[] }),
        ]);

        let initialReplies: BroadcastReplyRow[] | null = null;
        if (status === 'sent') {
          const rawReplies = repliesRes.data ?? [];
          if (rawReplies.length === 0) {
            initialReplies = [];
          } else {
            const authorIds = [...new Set(rawReplies.map((row) => String(row.author_id ?? '')).filter(Boolean))];
            const { data: names } = await supabase.from('profiles').select('id, full_name').in('id', authorIds);
            const namesById = new Map((names ?? []).map((profile) => [String(profile.id ?? ''), (profile.full_name as string) ?? null]));
            initialReplies = rawReplies.map((row) => ({
              id: String(row.id ?? ''),
              body: String(row.body ?? ''),
              visibility: row.visibility as 'private_to_author' | 'org_thread',
              created_at: String(row.created_at ?? ''),
              author_id: String(row.author_id ?? ''),
              author_name: namesById.get(String(row.author_id ?? '')) ?? null,
            }));
          }
        }

        return {
          mayEdit: mayEditRes.data === true,
          canSetCover: maySetCoverRes.data === true,
          navigation: status === 'sent' ? parseBroadcastFeedNavigation(navRes.data) : null,
          initialReplies,
          initial: {
            id: String(b.id ?? ''),
            org_id: broadcastOrgId,
            title: String(b.title ?? ''),
            body: String(b.body ?? ''),
            status,
            sent_at: (b.sent_at as string | null) ?? null,
            is_mandatory: Boolean(b.is_mandatory),
            is_pinned: Boolean(b.is_pinned),
            is_org_wide: Boolean(b.is_org_wide),
            cover_image_url: (b.cover_image_url as string | null) ?? null,
            dept_id: deptId,
            channel_id: channelId,
            created_by: createdBy,
            departments: deptRes.data ? { name: String(deptRes.data.name ?? '') } : null,
            broadcast_channels: channelRes.data ? { name: String(channelRes.data.name ?? '') } : null,
            department_teams: teamRes.data ? { name: String(teamRes.data.name ?? '') } : null,
            profiles: senderRes.data ? { full_name: String(senderRes.data.full_name ?? '') } : null,
          },
        };
      },
    });
  }
);
