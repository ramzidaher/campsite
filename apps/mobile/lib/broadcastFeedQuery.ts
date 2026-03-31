import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  enrichMobileBroadcastRows,
  type MobileBroadcastRow,
  type RawMobileBroadcast,
} from '@/lib/broadcastEnrichRows';

export type { MobileBroadcastRow, RawMobileBroadcast } from '@/lib/broadcastEnrichRows';

const BF_LEGACY_KEY = 'campsite.bf.feed_legacy_select';

export function parseRawBroadcastRecord(r: Record<string, unknown>): RawMobileBroadcast | null {
  const id = r.id != null ? String(r.id) : '';
  if (!id) return null;
  const deptId = r.dept_id != null ? String(r.dept_id) : '';
  const createdBy = r.created_by != null ? String(r.created_by) : '';
  if (!deptId || !createdBy) return null;
  return {
    id,
    title: String(r.title ?? ''),
    body: String(r.body ?? ''),
    sent_at: (r.sent_at as string | null) ?? null,
    dept_id: deptId,
    channel_id: r.channel_id != null ? String(r.channel_id) : null,
    team_id: r.team_id != null ? String(r.team_id) : null,
    created_by: createdBy,
    is_mandatory: Boolean(r.is_mandatory),
    is_pinned: Boolean(r.is_pinned),
    is_org_wide: Boolean(r.is_org_wide),
    cover_image_url:
      typeof r.cover_image_url === 'string' && r.cover_image_url.trim() ? r.cover_image_url : null,
  };
}

async function runFeedQuery(
  supabase: SupabaseClient,
  orgId: string,
  mode: 'plan02' | 'legacy',
  from: number,
  to: number,
  deptIds: string[] | null,
  channelIds: string[] | null,
) {
  let q = supabase.from('broadcasts').select('*').eq('org_id', orgId).eq('status', 'sent');
  if (mode === 'plan02') {
    q = q.order('is_pinned', { ascending: false }).order('sent_at', { ascending: false });
  } else {
    q = q.order('sent_at', { ascending: false });
  }
  if (deptIds?.length) q = q.in('dept_id', deptIds);
  if (channelIds?.length) q = q.in('channel_id', channelIds);
  return q.range(from, to);
}

export type FeedPageResult = { rows: MobileBroadcastRow[]; hasMore: boolean };

/** One page of sent broadcasts (RLS-scoped); enriched with read state and names. */
export async function fetchMobileBroadcastFeedPage(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
  pageIndex: number,
  pageSize: number,
  options?: { deptIds?: string[] | null; channelIds?: string[] | null },
): Promise<FeedPageResult> {
  let legacyStored = false;
  try {
    legacyStored = (await AsyncStorage.getItem(BF_LEGACY_KEY)) === '1';
  } catch {
    /* ignore */
  }

  const from = pageIndex * pageSize;
  const to = from + pageSize - 1;
  const deptIds = options?.deptIds?.length ? options.deptIds : null;
  const channelIds = options?.channelIds?.length ? options.channelIds : null;

  const mode: 'plan02' | 'legacy' = legacyStored ? 'legacy' : 'plan02';
  let { data, error } = await runFeedQuery(supabase, orgId, mode, from, to, deptIds, channelIds);

  if (error && mode === 'plan02') {
    const second = await runFeedQuery(supabase, orgId, 'legacy', from, to, deptIds, channelIds);
    if (!second.error) {
      try {
        await AsyncStorage.setItem(BF_LEGACY_KEY, '1');
      } catch {
        /* */
      }
      data = second.data;
      error = null;
    }
  } else if (!error && mode === 'plan02') {
    try {
      await AsyncStorage.removeItem(BF_LEGACY_KEY);
    } catch {
      /* */
    }
  }

  if (error) throw error;
  const records = (data ?? []) as Record<string, unknown>[];
  const raw: RawMobileBroadcast[] = [];
  for (const r of records) {
    const row = parseRawBroadcastRecord(r);
    if (row) raw.push(row);
  }

  const rows = await enrichMobileBroadcastRows(supabase, userId, raw);
  return { rows, hasMore: records.length === pageSize };
}

/** Search sent broadcasts visible to the user; then enrich. */
export async function searchMobileBroadcasts(
  supabase: SupabaseClient,
  userId: string,
  q: string,
  limitN = 50,
): Promise<MobileBroadcastRow[]> {
  const trimmed = q.trim();
  if (trimmed.length < 2) return [];

  const { data, error } = await supabase.rpc('search_broadcasts', {
    q: trimmed,
    limit_n: limitN,
  });
  if (error) throw error;

  const list = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
  const raw: RawMobileBroadcast[] = [];
  for (const r of list) {
    const row = parseRawBroadcastRecord(r);
    if (row) raw.push(row);
  }
  return enrichMobileBroadcastRows(supabase, userId, raw);
}
