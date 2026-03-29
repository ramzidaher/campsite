import { Card, EmptyState, useCampsiteTheme } from '@campsite/ui';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { TabSafeScreen } from '@/components/shell/TabSafeScreen';
import { useAuth } from '@/lib/AuthContext';
import { type MobileBroadcastRow, fetchMobileBroadcastFeed } from '@/lib/broadcastFeedQuery';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

function formatSentAt(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '';
  }
}

function BroadcastBadges({ row }: { row: MobileBroadcastRow }) {
  const { tokens } = useCampsiteTheme();
  if (!row.is_pinned && !row.is_mandatory && !row.is_org_wide) return null;
  return (
    <View style={styles.badgeRow}>
      {row.is_pinned ? (
        <View style={[styles.badge, { borderColor: tokens.border, backgroundColor: tokens.background }]}>
          <Text style={[styles.badgeText, { color: tokens.textSecondary }]}>Pinned</Text>
        </View>
      ) : null}
      {row.is_mandatory ? (
        <View style={[styles.badge, styles.badgeUrgent]}>
          <Text style={[styles.badgeText, { color: '#991b1b' }]}>Mandatory</Text>
        </View>
      ) : null}
      {row.is_org_wide ? (
        <View style={[styles.badge, styles.badgeWide]}>
          <Text style={[styles.badgeText, { color: '#0369a1' }]}>Org-wide</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function BroadcastsScreen() {
  const { tokens } = useCampsiteTheme();
  const { profile, configured } = useAuth();
  const orgId = profile?.org_id ?? null;
  const [detail, setDetail] = useState<MobileBroadcastRow | null>(null);

  const query = useQuery({
    queryKey: ['mobile-broadcast-feed', orgId],
    enabled: configured && isSupabaseConfigured() && !!orgId,
    queryFn: async () => {
      const supabase = getSupabase();
      if (!orgId) return [];
      return fetchMobileBroadcastFeed(supabase, orgId, 60);
    },
    staleTime: 30_000,
  });

  const rows = query.data ?? [];

  const listEmpty = useMemo(
    () => (
      <EmptyState
        title="Nothing new"
        description="When your team posts updates, they will appear here."
      />
    ),
    [],
  );

  if (!configured || !isSupabaseConfigured()) {
    return (
      <TabSafeScreen>
        <View style={[styles.screen, { backgroundColor: tokens.background }]}>
          <Text style={{ color: tokens.textSecondary }}>
            Connect Supabase (EXPO_PUBLIC_SUPABASE_URL / ANON_KEY) to load broadcasts.
          </Text>
        </View>
      </TabSafeScreen>
    );
  }

  if (!orgId) {
    return (
      <TabSafeScreen>
        <View style={[styles.screen, { backgroundColor: tokens.background }]}>
          <Text style={{ color: tokens.textSecondary }}>Complete registration to see broadcasts.</Text>
        </View>
      </TabSafeScreen>
    );
  }

  return (
    <TabSafeScreen>
      <View style={[styles.screen, { backgroundColor: tokens.background }]}>
        <Text style={[styles.lead, { color: tokens.textSecondary }]}>
          Organisation broadcasts — org-wide posts reach everyone; specific posts use department, category, and
          optional team, same rules as the web app.
        </Text>

        {query.isLoading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={tokens.textPrimary} />
        ) : query.isError ? (
          <Card style={styles.card}>
            <Text style={[styles.cardTitle, { color: '#b91c1c' }]}>Could not load</Text>
            <Text style={[styles.cardBody, { color: tokens.textSecondary }]}>
              {query.error instanceof Error ? query.error.message : 'Unknown error'}
            </Text>
          </Card>
        ) : rows.length === 0 ? (
          listEmpty
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(item) => item.id}
            style={{ flex: 1 }}
            refreshControl={
              <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
            }
            ListEmptyComponent={listEmpty}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => setDetail(item)}
                style={({ pressed }) => [
                  styles.item,
                  {
                    borderColor: tokens.border,
                    backgroundColor: tokens.background,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <View style={styles.itemHeader}>
                  <Text style={[styles.itemTitle, { color: tokens.textPrimary }]} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={[styles.itemTime, { color: tokens.textSecondary }]}>
                    {formatSentAt(item.sent_at)}
                  </Text>
                </View>
                <Text style={[styles.preview, { color: tokens.textSecondary }]} numberOfLines={2}>
                  {item.body.replace(/\s+/g, ' ').trim()}
                </Text>
                {item.dept_name || item.cat_name || item.team_name || item.is_org_wide ? (
                  <Text style={[styles.metaLine, { color: tokens.textMuted }]} numberOfLines={1}>
                    {[item.dept_name, item.is_org_wide ? 'All channels' : item.cat_name, item.team_name]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                ) : null}
                <BroadcastBadges row={item} />
              </Pressable>
            )}
          />
        )}

        <Text style={[styles.footerHint, { color: tokens.textSecondary }]}>
          Compose and advanced options: use the web app. Push delivery uses the same recipient rules via
          `broadcast_notification_recipient_user_ids` (Edge worker).
        </Text>
      </View>

      <Modal visible={detail !== null} animationType="slide" transparent onRequestClose={() => setDetail(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setDetail(null)}>
          <Pressable style={[styles.modalCard, { backgroundColor: tokens.background }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: tokens.textPrimary }]}>{detail?.title}</Text>
            <Text style={[styles.modalMeta, { color: tokens.textSecondary }]}>
              {detail ? formatSentAt(detail.sent_at) : ''}
            </Text>
            {detail ? <BroadcastBadges row={detail} /> : null}
            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={[styles.modalText, { color: tokens.textPrimary }]}>{detail?.body}</Text>
            </ScrollView>
            <Pressable style={styles.modalClose} onPress={() => setDetail(null)}>
              <Text style={{ color: tokens.textPrimary, fontWeight: '600' }}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </TabSafeScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20, gap: 12 },
  lead: { fontSize: 14, lineHeight: 21 },
  card: { marginTop: 4 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardBody: { marginTop: 8, fontSize: 14, lineHeight: 20 },
  item: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' },
  itemTitle: { flex: 1, fontSize: 16, fontWeight: '600' },
  itemTime: { fontSize: 12, marginTop: 2 },
  preview: { marginTop: 8, fontSize: 14, lineHeight: 20 },
  metaLine: { marginTop: 6, fontSize: 12, lineHeight: 16 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeUrgent: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  badgeWide: { backgroundColor: '#e0f2fe', borderColor: '#bae6fd' },
  badgeText: { fontSize: 11, fontWeight: '600' },
  footerHint: { fontSize: 12, lineHeight: 18, marginTop: 8 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    maxHeight: '88%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: '700' },
  modalMeta: { fontSize: 13, marginTop: 6 },
  modalBody: { maxHeight: 360, marginTop: 12 },
  modalText: { fontSize: 15, lineHeight: 22 },
  modalClose: { marginTop: 16, alignItems: 'center', paddingVertical: 12 },
});
