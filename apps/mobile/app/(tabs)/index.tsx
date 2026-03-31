import { EmptyState, useCampsiteTheme } from '@campsite/ui';
import {
  canComposeBroadcast,
  canViewDashboardStatTiles,
  isBroadcastDraftOnlyRole,
} from '@campsite/types';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { BroadcastMetaChips } from '@/components/broadcasts/BroadcastMetaChips';
import { HomeMiniCalendar } from '@/components/home/HomeMiniCalendar';
import { TabSafeScreen } from '@/components/shell/TabSafeScreen';
import { mainShell } from '@/constants/mainShell';
import { useAuth } from '@/lib/AuthContext';
import type { MobileBroadcastRow } from '@/lib/broadcastEnrichRows';
import { openBroadcastDetail } from '@/lib/broadcastCoverPrefetch';
import { loadMobileHomeData } from '@/lib/mobileHomeData';
import { relTime } from '@/lib/relTime';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

const serif = Platform.OS === 'ios' ? 'Georgia' : 'serif';
const CAROUSEL_GAP = 12;
const CAROUSEL_CARD_WIDTH = Math.min(320, Dimensions.get('window').width * 0.82);
/** Minimum tap target; card grows with chip rows (web-style), no fixed empty block. */
const CAROUSEL_CARD_MIN_HEIGHT = 108;

function stripPreview(raw: string, max = 120) {
  const t = raw.replace(/\n+/g, ' ').replace(/[#*_`]/g, '').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function BroadcastCarouselCard({
  row,
  cardBg,
  border,
  textPrimary,
  textSecondary,
  textMuted,
  onPress,
}: {
  row: MobileBroadcastRow;
  cardBg: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  onPress: () => void;
}) {
  const unread = row.read === false;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.carouselCardOuter,
        { borderColor: border, opacity: pressed ? 0.92 : 1, backgroundColor: cardBg },
      ]}
    >
      {unread ? <View style={styles.carouselUnreadBar} /> : null}
      <View style={styles.carouselCardInner}>
        <View style={styles.carouselCardHeader}>
          <Text
            style={[
              styles.carouselTitle,
              { color: textPrimary },
              unread ? { fontWeight: '700' } : { fontWeight: '600' },
            ]}
            numberOfLines={2}
          >
            {row.title}
          </Text>
          <Text style={[styles.carouselTime, { color: textMuted }]} numberOfLines={1}>
            {relTime(row.sent_at)}
          </Text>
        </View>
        <Text style={[styles.carouselPreview, { color: textSecondary }]} numberOfLines={2}>
          {stripPreview(row.body)}
        </Text>
        <BroadcastMetaChips row={row} style={{ maxWidth: CAROUSEL_CARD_WIDTH - 36 }} />
      </View>
    </Pressable>
  );
}

export default function HomeScreen() {
  const { tokens, scheme } = useCampsiteTheme();
  const router = useRouter();
  const { profile, configured } = useAuth();
  const orgId = profile?.org_id ?? null;
  const userId = profile?.id ?? null;
  const role = profile?.role ?? '';

  const cardBg = scheme === 'dark' ? tokens.surface : '#ffffff';
  const statLabelColor = tokens.textMuted;
  const pageBg = tokens.background;

  const homeQuery = useQuery({
    queryKey: ['mobile-home', userId, orgId, role],
    enabled:
      configured &&
      isSupabaseConfigured() &&
      !!orgId &&
      !!userId &&
      profile?.status === 'active',
    queryFn: async () => {
      const supabase = getSupabase();
      return loadMobileHomeData(supabase, userId!, orgId!, role);
    },
    staleTime: 60_000,
  });

  const canCompose = canComposeBroadcast(role);
  const showPrimaryCompose = canCompose && !isBroadcastDraftOnlyRole(role);
  const showDashboardKpis = canViewDashboardStatTiles(role);

  const now = useMemo(() => new Date(), []);

  if (!configured || !isSupabaseConfigured()) {
    return (
      <TabSafeScreen>
        <View style={[styles.screen, { backgroundColor: pageBg }]}>
          <Text style={{ color: tokens.textSecondary }}>
            Connect Supabase (EXPO_PUBLIC_SUPABASE_URL / ANON_KEY) to load Home.
          </Text>
        </View>
      </TabSafeScreen>
    );
  }

  if (!profile || profile.status !== 'active' || !orgId) {
    return (
      <TabSafeScreen>
        <View style={[styles.screen, { backgroundColor: pageBg }]}>
          <EmptyState
            title="Almost there"
            description="Finish registration on web or complete pending approval to see Home."
          />
        </View>
      </TabSafeScreen>
    );
  }

  const data = homeQuery.data;
  const stats = data?.stats;
  const statScope = stats?.statScope;

  const broadcastsSentSub =
    statScope === 'dept' ? 'Your department(s)' : 'Sent in your organisation';
  const membersSub =
    statScope === 'dept' ? 'In your department(s)' : 'In the organisation';

  return (
    <TabSafeScreen>
      <ScrollView
        style={{ flex: 1, backgroundColor: pageBg }}
        contentContainerStyle={[styles.scrollContent, { backgroundColor: pageBg }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroRow}>
          <View style={styles.heroTextCol}>
            <Text style={[styles.dateOrg, { color: tokens.textSecondary }]}>
              {now.toLocaleDateString(undefined, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
              {' · '}
              {data?.orgName ?? '…'}
              {homeQuery.isFetching ? ' · updating…' : ''}
            </Text>
          </View>
          {showPrimaryCompose ? (
            <Pressable
              onPress={() => router.push('/broadcast-compose')}
              style={({ pressed }) => [styles.composeBtn, { opacity: pressed ? 0.88 : 1 }]}
            >
              <Text style={styles.composeBtnText}>✏ New broadcast</Text>
            </Pressable>
          ) : canCompose ? (
            <Pressable
              onPress={() => router.push('/broadcast-compose')}
              style={({ pressed }) => [styles.composeBtn, { opacity: pressed ? 0.88 : 1 }]}
            >
              <Text style={styles.composeBtnText}>✏ Submit draft</Text>
            </Pressable>
          ) : null}
        </View>

        {homeQuery.isLoading ? (
          <ActivityIndicator style={{ marginVertical: 24 }} color={tokens.textPrimary} />
        ) : (
          <>
            {showDashboardKpis && stats ? (
              <View style={styles.statRow}>
                {stats.broadcastTotal !== undefined ? (
                  <Pressable
                    onPress={() => router.push('/(tabs)/broadcasts')}
                    style={({ pressed }) => [
                      styles.statTile,
                      {
                        backgroundColor: cardBg,
                        borderColor: tokens.border,
                        opacity: pressed ? 0.96 : 1,
                      },
                    ]}
                  >
                    <Text style={[styles.statKicker, { color: statLabelColor }]}>
                      📡 BROADCASTS SENT
                    </Text>
                    <Text style={[styles.statValue, { color: tokens.textPrimary }]}>
                      {stats.broadcastTotal}
                    </Text>
                    <Text style={[styles.statFoot, { color: statLabelColor }]}>{broadcastsSentSub}</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => router.push('/(tabs)/broadcasts')}
                  style={({ pressed }) => [
                    styles.statTile,
                    {
                      backgroundColor: cardBg,
                      borderColor: tokens.border,
                      opacity: pressed ? 0.96 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.statKicker, { color: statLabelColor }]}>👥 ACTIVE MEMBERS</Text>
                  <Text style={[styles.statValue, { color: tokens.textPrimary }]}>
                    {stats.memberActiveTotal}
                  </Text>
                  <Text style={[styles.statFoot, { color: statLabelColor }]}>{membersSub}</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: tokens.textPrimary }]}>Recent broadcasts</Text>
              <Pressable onPress={() => router.push('/(tabs)/broadcasts')}>
                <Text style={[styles.sectionLink, { color: tokens.textSecondary }]}>View all →</Text>
              </Pressable>
            </View>

            {data && data.recentBroadcasts.length === 0 ? (
              <View
                style={[
                  styles.emptyBroadcasts,
                  { borderColor: tokens.border, backgroundColor: cardBg },
                ]}
              >
                <Text style={[styles.emptyBroadcastsText, { color: tokens.textMuted }]}>
                  No broadcasts yet. Check back soon.
                </Text>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.carouselContent}
                decelerationRate="fast"
                snapToInterval={CAROUSEL_CARD_WIDTH + CAROUSEL_GAP}
                snapToAlignment="start"
              >
                {(data?.recentBroadcasts ?? []).map((row) => (
                  <View key={row.id} style={styles.carouselSlot}>
                    <BroadcastCarouselCard
                      row={row}
                      cardBg={cardBg}
                      border={tokens.border}
                      textPrimary={tokens.textPrimary}
                      textSecondary={tokens.textSecondary}
                      textMuted={tokens.textMuted}
                      onPress={() => openBroadcastDetail(router, row)}
                    />
                  </View>
                ))}
              </ScrollView>
            )}

            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: tokens.textPrimary }]}>Calendar</Text>
              <Pressable onPress={() => router.push('/(tabs)/calendar')}>
                <Text style={[styles.sectionLink, { color: tokens.textSecondary }]}>Open calendar →</Text>
              </Pressable>
            </View>

            {data ? (
              <HomeMiniCalendar
                eventDays={data.calendarEventDays}
                initialYear={data.calendarYear}
                initialMonth={data.calendarMonth}
                todayY={now.getFullYear()}
                todayM={now.getMonth()}
                todayD={now.getDate()}
                upcomingEvents={data.upcomingEvents}
                onPressOpenCalendar={() => router.push('/(tabs)/calendar')}
              />
            ) : null}

            <View style={{ height: 24 }} />
          </>
        )}
      </ScrollView>
    </TabSafeScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 20 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 20,
  },
  heroTextCol: { flex: 1, minWidth: 0 },
  dateOrg: { fontSize: 13, lineHeight: 19 },
  composeBtn: {
    alignSelf: 'flex-start',
    backgroundColor: mainShell.sidebarBg,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    minHeight: 40,
    justifyContent: 'center',
  },
  composeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: mainShell.sidebarText,
  },
  statRow: { flexDirection: 'row', gap: 14, marginBottom: 22 },
  statTile: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 18,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
      },
      android: { elevation: 1 },
    }),
  },
  statKicker: {
    fontSize: 11.5,
    fontWeight: '600',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  statValue: {
    fontSize: 32,
    lineHeight: 36,
    fontFamily: serif,
    letterSpacing: -0.5,
  },
  statFoot: { fontSize: 12, marginTop: 8, lineHeight: 16 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: serif,
    letterSpacing: -0.2,
  },
  sectionLink: { fontSize: 12.5, textDecorationLine: 'underline' },
  carouselContent: {
    paddingBottom: 4,
    paddingRight: 20,
  },
  carouselSlot: {
    width: CAROUSEL_CARD_WIDTH,
    marginRight: CAROUSEL_GAP,
  },
  carouselCardOuter: {
    width: '100%',
    minHeight: CAROUSEL_CARD_MIN_HEIGHT,
    flexDirection: 'row',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
    }),
  },
  carouselUnreadBar: { width: 3, backgroundColor: mainShell.pageText },
  carouselCardInner: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  carouselCardHeader: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  carouselTitle: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 19 },
  carouselTime: { flexShrink: 0, maxWidth: '36%', fontSize: 11.5, marginTop: 1, textAlign: 'right' },
  carouselPreview: { fontSize: 12.5, lineHeight: 18 },
  emptyBroadcasts: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: 36,
    paddingHorizontal: 20,
    marginBottom: 22,
    alignItems: 'center',
  },
  emptyBroadcastsText: { fontSize: 14, textAlign: 'center' },
});
