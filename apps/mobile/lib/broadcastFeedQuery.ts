import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';

const BF_LEGACY_KEY = 'campsite.bf.feed_legacy_select';

export type MobileBroadcastRow = {
  id: string;
  title: string;
  body: string;
  sent_at: string | null;
  is_mandatory: boolean;
  is_pinned: boolean;
  is_org_wide: boolean;
};

async function runFeedQuery(
  supabase: SupabaseClient,
  orgId: string,
  mode: 'plan02' | 'legacy',
  limit: number,
) {
  const select =
    mode === 'plan02'
      ? 'id,title,body,sent_at,is_mandatory,is_pinned,is_org_wide'
      : 'id,title,body,sent_at';
  let q = supabase.from('broadcasts').select(select).eq('org_id', orgId).eq('status', 'sent');
  if (mode === 'plan02') {
    q = q.order('is_pinned', { ascending: false }).order('sent_at', { ascending: false });
  } else {
    q = q.order('sent_at', { ascending: false });
  }
  return q.limit(limit);
}

function normalizeRow(r: Record<string, unknown>): MobileBroadcastRow {
  return {
    id: String(r.id),
    title: String(r.title ?? ''),
    body: String(r.body ?? ''),
    sent_at: (r.sent_at as string | null) ?? null,
    is_mandatory: Boolean(r.is_mandatory),
    is_pinned: Boolean(r.is_pinned),
    is_org_wide: Boolean(r.is_org_wide),
  };
}

/** Sent broadcasts for the org; matches web feed columns and legacy fallback. */
export async function fetchMobileBroadcastFeed(
  supabase: SupabaseClient,
  orgId: string,
  limit = 50,
): Promise<MobileBroadcastRow[]> {
  let legacyStored = false;
  try {
    legacyStored = (await AsyncStorage.getItem(BF_LEGACY_KEY)) === '1';
  } catch {
    /* ignore */
  }

  let mode: 'plan02' | 'legacy' = legacyStored ? 'legacy' : 'plan02';
  let { data, error } = await runFeedQuery(supabase, orgId, mode, limit);

  if (error && mode === 'plan02') {
    const second = await runFeedQuery(supabase, orgId, 'legacy', limit);
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
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return rows.map(normalizeRow);
}
