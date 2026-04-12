import {
  canComposeBroadcast,
  isBroadcastApproverRole,
  type ProfileRole,
} from '@campsite/types';
import { Button, Card, EmptyState, Input, useCampsiteTheme, useToast } from '@campsite/ui';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { BroadcastBadges } from '@/components/broadcasts/BroadcastBadges';
import { TabSafeScreen } from '@/components/shell/TabSafeScreen';
import { type DeptRow, departmentsForBroadcast } from '@/lib/broadcastDeptScope';
import { openBroadcastDetail } from '@/lib/broadcastCoverPrefetch';
import { type MobileBroadcastRow, fetchMobileBroadcastFeedPage, searchMobileBroadcasts } from '@/lib/broadcastFeedQuery';
import { useAuth } from '@/lib/AuthContext';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

const FILTER_KEY_PILL = 'campsite_broadcast_feed_pill_mobile';
const PAGE_SIZE = 20;
/** Must match `screenTop.marginBottom` — space between filters and list. */
const SCREEN_TOP_BELOW_GAP = 8;

function formatSentAt(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '';
  }
}

function preview(md: string): string {
  return md.replace(/\n+/g, ' ').replace(/[#*_`]/g, '').slice(0, 140);
}

function isLikelyDeptPillId(v: string): boolean {
  return v.length >= 32 && /^[0-9a-f-]+$/i.test(v);
}

export default function BroadcastsScreen() {
  const { tokens, scheme } = useCampsiteTheme();
  const { show: showToast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile, configured, user } = useAuth();
  const orgId = profile?.org_id ?? null;
  const userId = profile?.id ?? user?.id ?? null;
  const role = (profile?.role ?? 'worker') as ProfileRole;

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [feedPill, setFeedPill] = useState<'all' | 'unread' | string>('all');
  const [pillHydrated, setPillHydrated] = useState(false);
  const [markAllBusy, setMarkAllBusy] = useState(false);


  useEffect(() => {
    const delay = searchQuery.trim().length >= 2 ? 300 : 0;
    const t = setTimeout(() => setDebouncedSearch(searchQuery), delay);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    void AsyncStorage.getItem(FILTER_KEY_PILL).then((raw) => {
      const v = raw?.trim() ?? '';
      if (v === 'all' || v === 'unread' || isLikelyDeptPillId(v)) {
        setFeedPill(v === 'all' || v === 'unread' ? v : v);
      }
      setPillHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!pillHydrated) return;
    void AsyncStorage.setItem(FILTER_KEY_PILL, feedPill);
  }, [feedPill, pillHydrated]);

  const pillMeta = useQuery({
    queryKey: ['mobile-broadcast-pills', orgId, userId, role],
    enabled: configured && isSupabaseConfigured() && !!orgId && !!userId,
    queryFn: async () => {
      const supabase = getSupabase();
      const [{ data: deps }, { data: ud }, { data: dm }] = await Promise.all([
        supabase.from('departments').select('id,org_id,name,type,is_archived').eq('org_id', orgId!),
        supabase.from('user_departments').select('dept_id').eq('user_id', userId!),
        supabase.from('dept_managers').select('dept_id').eq('user_id', userId!),
      ]);
      const departments = (deps ?? []) as DeptRow[];
      const userDeptIds = new Set((ud ?? []).map((r) => r.dept_id as string));
      const managedDeptIds = new Set((dm ?? []).map((r) => r.dept_id as string));
      const scoped = departmentsForBroadcast(role, orgId!, departments, userDeptIds, managedDeptIds);
      return { scopedDepts: scoped };
    },
    staleTime: 60_000,
  });

  const scopedDepts = pillMeta.data?.scopedDepts ?? [];

  const deptFilterForQuery = useMemo(() => {
    if (feedPill === 'all' || feedPill === 'unread') return null;
    if (isLikelyDeptPillId(feedPill)) return [feedPill];
    return null;
  }, [feedPill]);

  const deptKey = deptFilterForQuery?.join('|') ?? 'all';
  const searchActive = debouncedSearch.trim().length >= 2;
  const qTrim = debouncedSearch.trim();

  const infiniteFeed = useInfiniteQuery({
    queryKey: ['mobile-broadcast-feed', orgId, userId, deptKey],
    enabled:
      configured && isSupabaseConfigured() && !!orgId && !!userId && pillHydrated && !searchActive,
    initialPageParam: 0,
    staleTime: 60_000,
    queryFn: async ({ pageParam }) => {
      const supabase = getSupabase();
      return fetchMobileBroadcastFeedPage(supabase, userId!, orgId!, pageParam, PAGE_SIZE, {
        deptIds: deptFilterForQuery,
      });
    },
    getNextPageParam: (last, all) => (last.hasMore ? all.length : undefined),
  });

  const searchQueryResult = useQuery({
    queryKey: ['mobile-broadcast-search', orgId, userId, qTrim],
    enabled: configured && isSupabaseConfigured() && !!orgId && !!userId && searchActive,
    staleTime: 60_000,
    queryFn: async () => {
      const supabase = getSupabase();
      return searchMobileBroadcasts(supabase, userId!, qTrim, 50);
    },
  });

  const baseRows = useMemo((): MobileBroadcastRow[] => {
    if (searchActive) return searchQueryResult.data ?? [];
    return infiniteFeed.data?.pages.flatMap((p) => p.rows) ?? [];
  }, [searchActive, searchQueryResult.data, infiniteFeed.data?.pages]);

  const displayRows = useMemo(() => {
    if (feedPill !== 'unread') return baseRows;
    return baseRows.filter((r) => !r.read);
  }, [baseRows, feedPill]);

  const loading = searchActive ? searchQueryResult.isLoading : infiniteFeed.isLoading;
  const fetching = searchActive ? searchQueryResult.isFetching : infiniteFeed.isFetching;
  const refetching = searchActive ? searchQueryResult.isRefetching : infiniteFeed.isRefetching;
  const listError = searchActive ? searchQueryResult.error : infiniteFeed.error;

  const trulyEmpty = searchActive
    ? !loading && (searchQueryResult.data ?? []).length === 0
    : !loading && baseRows.length === 0;
  const filteredOutByUnread =
    feedPill === 'unread' && !loading && baseRows.length > 0 && displayRows.length === 0;

  const cardBg = scheme === 'dark' ? tokens.surface : '#ffffff';

  const markAllRead = useCallback(async () => {
    setMarkAllBusy(true);
    try {
      const { error } = await getSupabase().rpc('broadcast_mark_all_read');
      if (error) throw error;
      showToast('All marked as read');
      await queryClient.invalidateQueries({ queryKey: ['mobile-broadcast-feed'] });
      await queryClient.invalidateQueries({ queryKey: ['mobile-broadcast-search'] });
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not mark all read');
    } finally {
      setMarkAllBusy(false);
    }
  }, [queryClient, showToast]);

  const openPendingApprovals = useCallback(() => {
    router.push('/broadcast-pending');
  }, [router]);

  const composeAllowed = canComposeBroadcast(role);
  const approver = isBroadcastApproverRole(role);

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

  if (!orgId || !userId) {
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
        <View style={styles.screenTop}>
          <View style={styles.toolbar}>
            <Input
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search broadcasts…"
              style={styles.searchInput}
            />
            <View style={styles.toolbarRow}>
              <Button variant="ghost" loading={markAllBusy} onPress={() => void markAllRead()} style={styles.toolbarBtn}>
                Mark all read
              </Button>
              {composeAllowed ? (
                <Button variant="secondary" onPress={() => router.push('/broadcast-compose')} style={styles.toolbarBtn}>
                  New broadcast
                </Button>
              ) : null}
              {approver ? (
                <Button variant="ghost" onPress={openPendingApprovals} style={styles.toolbarBtn}>
                  Pending approvals
                </Button>
              ) : null}
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll} contentContainerStyle={styles.pillRow}>
            <Pill label="All" selected={feedPill === 'all'} onPress={() => setFeedPill('all')} tokens={tokens} />
            <Pill label="Unread" selected={feedPill === 'unread'} onPress={() => setFeedPill('unread')} tokens={tokens} />
            {scopedDepts.map((d) => (
              <Pill
                key={d.id}
                label={d.name}
                selected={feedPill === d.id}
                onPress={() => setFeedPill(d.id)}
                tokens={tokens}
              />
            ))}
          </ScrollView>

          {fetching && baseRows.length > 0 ? (
            <Text style={[styles.updating, { color: tokens.textMuted }]} accessibilityLiveRegion="polite">
              Updating…
            </Text>
          ) : null}

          {feedPill === 'unread' && !searchActive ? (
            <Text style={[styles.hint, { color: tokens.textMuted }]}>
              Unread filters loaded items. Load more to fetch older posts, then unread ones will appear here.
            </Text>
          ) : null}
        </View>

        {loading && !(searchActive ? (searchQueryResult.data ?? []).length : baseRows.length) ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={tokens.textPrimary} />
        ) : listError ? (
          <Card style={styles.card}>
            <Text style={[styles.cardTitle, { color: tokens.warning }]}>Could not load</Text>
            <Text style={[styles.cardBody, { color: tokens.textSecondary }]}>
              {listError instanceof Error ? listError.message : 'Unknown error'}
            </Text>
          </Card>
        ) : trulyEmpty ? (
          <EmptyState
            title={searchActive ? 'No matches' : 'No broadcasts here'}
            description={
              searchActive
                ? 'Try different words or clear search.'
                : composeAllowed
                  ? 'Try another filter or compose a new broadcast.'
                  : 'Try another filter or check back later.'}
          />
        ) : !searchActive && filteredOutByUnread ? (
          <EmptyState
            title="No unread in loaded items"
            description="Load more below or switch to All."
          />
        ) : (
          <View style={styles.listSlot}>
            {searchActive ? (
              <FlatList
                data={searchQueryResult.data ?? []}
                keyExtractor={(row) => row.id}
                style={styles.list}
                removeClippedSubviews={Platform.OS !== 'android'}
                refreshControl={
                  <RefreshControl
                    refreshing={refetching}
                    onRefresh={() => void searchQueryResult.refetch()}
                    tintColor={tokens.textPrimary}
                    colors={[tokens.textPrimary]}
                  />
                }
                renderItem={({ item: row }) => {
                  const unread = row.read === false;
                  return (
                    <Pressable
                      onPress={() => openBroadcastDetail(router, row)}
                      style={({ pressed }) => [
                        styles.itemOuter,
                        { opacity: pressed ? 0.92 : 1 },
                      ]}
                    >
                      {unread ? <View style={styles.unreadBar} /> : null}
                      <View
                        style={[
                          styles.item,
                          {
                            borderColor: tokens.border,
                            backgroundColor: cardBg,
                          },
                        ]}
                      >
                        <View style={styles.itemHeader}>
                          <Text
                            style={[
                              styles.itemTitle,
                              { color: tokens.textPrimary },
                              unread ? styles.itemTitleUnread : styles.itemTitleRead,
                            ]}
                            numberOfLines={2}
                          >
                            {row.title}
                          </Text>
                          <Text style={[styles.itemTime, { color: tokens.textSecondary }]}>
                            {formatSentAt(row.sent_at)}
                          </Text>
                        </View>
                        <Text style={[styles.preview, { color: tokens.textSecondary }]} numberOfLines={2}>
                          {preview(row.body)}
                        </Text>
                        {row.dept_name || row.channel_name || row.team_name || row.is_org_wide ? (
                          <Text style={[styles.metaLine, { color: tokens.textMuted }]} numberOfLines={1}>
                            {[row.dept_name, row.is_org_wide ? 'All channels' : row.channel_name, row.team_name]
                              .filter(Boolean)
                              .join(' · ')}
                          </Text>
                        ) : null}
                        {row.author_name ? (
                          <Text style={[styles.authorLine, { color: tokens.textMuted }]} numberOfLines={1}>
                            {row.author_name}
                          </Text>
                        ) : null}
                        <BroadcastBadges row={row} />
                      </View>
                    </Pressable>
                  );
                }}
              />
            ) : (
              <FlatList
                data={displayRows}
                keyExtractor={(item) => item.id}
                style={styles.list}
                removeClippedSubviews={Platform.OS !== 'android'}
                refreshControl={
                  <RefreshControl
                    refreshing={refetching}
                    onRefresh={() => void infiniteFeed.refetch()}
                    tintColor={tokens.textPrimary}
                    colors={[tokens.textPrimary]}
                  />
                }
                onEndReached={() => {
                  if (infiniteFeed.hasNextPage && !infiniteFeed.isFetchingNextPage) {
                    void infiniteFeed.fetchNextPage();
                  }
                }}
                onEndReachedThreshold={0.3}
                ListFooterComponent={
                  infiniteFeed.hasNextPage ? (
                    <View style={styles.footerLoad}>
                      {infiniteFeed.isFetchingNextPage ? (
                        <ActivityIndicator color={tokens.textPrimary} />
                      ) : (
                        <Pressable onPress={() => void infiniteFeed.fetchNextPage()}>
                          <Text style={{ color: tokens.accent, fontWeight: '600', textAlign: 'center' }}>Load more</Text>
                        </Pressable>
                      )}
                    </View>
                  ) : null
                }
                renderItem={({ item }) => {
                  const unread = item.read === false;
                  return (
                    <Pressable
                      onPress={() => openBroadcastDetail(router, item)}
                      style={({ pressed }) => [
                        styles.itemOuter,
                        { opacity: pressed ? 0.92 : 1 },
                      ]}
                    >
                      {unread ? <View style={styles.unreadBar} /> : null}
                      <View
                        style={[
                          styles.item,
                          {
                            borderColor: tokens.border,
                            backgroundColor: cardBg,
                          },
                        ]}
                      >
                        <View style={styles.itemHeader}>
                          <Text
                            style={[
                              styles.itemTitle,
                              { color: tokens.textPrimary },
                              unread ? styles.itemTitleUnread : styles.itemTitleRead,
                            ]}
                            numberOfLines={2}
                          >
                            {item.title}
                          </Text>
                          <Text style={[styles.itemTime, { color: tokens.textSecondary }]}>
                            {formatSentAt(item.sent_at)}
                          </Text>
                        </View>
                        <Text style={[styles.preview, { color: tokens.textSecondary }]} numberOfLines={2}>
                          {preview(item.body)}
                        </Text>
                        {item.dept_name || item.channel_name || item.team_name || item.is_org_wide ? (
                          <Text style={[styles.metaLine, { color: tokens.textMuted }]} numberOfLines={1}>
                            {[item.dept_name, item.is_org_wide ? 'All channels' : item.channel_name, item.team_name]
                              .filter(Boolean)
                              .join(' · ')}
                          </Text>
                        ) : null}
                        {item.author_name ? (
                          <Text style={[styles.authorLine, { color: tokens.textMuted }]} numberOfLines={1}>
                            {item.author_name}
                          </Text>
                        ) : null}
                        <BroadcastBadges row={item} />
                      </View>
                    </Pressable>
                  );
                }}
              />
            )}
          </View>
        )}
      </View>
    </TabSafeScreen>
  );
}

function Pill({
  label,
  selected,
  onPress,
  tokens,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  tokens: { border: string; textPrimary: string; textMuted: string; surface: string };
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.pill,
        {
          borderColor: selected ? tokens.textPrimary : tokens.border,
          backgroundColor: selected ? tokens.surface : 'transparent',
        },
      ]}
    >
      <Text
        style={{
          fontSize: 13,
          fontWeight: '600',
          color: selected ? tokens.textPrimary : tokens.textMuted,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /** Avoid `gap` on this column: Android Yoga can shrink the flex list sibling incorrectly. */
  screen: { flex: 1, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  screenTop: { flexShrink: 0, gap: 8, marginBottom: SCREEN_TOP_BELOW_GAP },
  /**
   * flexBasis: 0 + flexGrow: 1 is the reliable pattern for “fill remaining height” with VirtualizedList on Android.
   */
  listSlot: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minHeight: 0,
    minWidth: 0,
    alignSelf: 'stretch',
  },
  list: { flex: 1 },
  toolbar: { gap: 8 },
  toolbarRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  toolbarBtn: { flexGrow: 0, paddingHorizontal: 12, minHeight: 40 },
  searchInput: { minHeight: 44 },
  pillScroll: { maxHeight: 44, flexGrow: 0 },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 200,
  },
  updating: { fontSize: 12 },
  hint: { fontSize: 12, lineHeight: 17 },
  card: { marginTop: 4 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardBody: { marginTop: 8, fontSize: 14, lineHeight: 20 },
  itemOuter: { flexDirection: 'row', marginBottom: 10, borderRadius: 14, overflow: 'hidden' },
  unreadBar: { width: 3, backgroundColor: '#121212' },
  item: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
      },
      android: { elevation: 1 },
    }),
  },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' },
  itemTitle: { flex: 1, fontSize: 14, lineHeight: 20 },
  itemTitleUnread: { fontWeight: '700' },
  itemTitleRead: { fontWeight: '500' },
  itemTime: { fontSize: 12, marginTop: 2 },
  preview: { marginTop: 8, fontSize: 14, lineHeight: 20 },
  metaLine: { marginTop: 6, fontSize: 12, lineHeight: 16 },
  authorLine: { marginTop: 4, fontSize: 12 },
  footerLoad: { paddingVertical: 16 },
});
