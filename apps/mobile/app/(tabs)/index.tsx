import { fetchDashboardStatCounts } from '@campsite/api';
import { Card, EmptyState, useCampsiteTheme } from '@campsite/ui';
import {
  canComposeBroadcast,
  isBroadcastDraftOnlyRole,
} from '@campsite/types';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TabSafeScreen } from '@/components/shell/TabSafeScreen';
import { useAuth } from '@/lib/AuthContext';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export default function DashboardScreen() {
  const { tokens } = useCampsiteTheme();
  const router = useRouter();
  const { profile, configured } = useAuth();
  const orgId = profile?.org_id ?? null;
  const userId = profile?.id ?? null;
  const role = profile?.role ?? '';

  const dashboardQuery = useQuery({
    queryKey: ['mobile-dashboard', userId, orgId, role],
    enabled:
      configured &&
      isSupabaseConfigured() &&
      !!orgId &&
      !!userId &&
      profile?.status === 'active',
    queryFn: async () => {
      const supabase = getSupabase();
      const [{ data: orgRow }, stats] = await Promise.all([
        supabase.from('organisations').select('name').eq('id', orgId!).single(),
        fetchDashboardStatCounts(supabase, { userId: userId!, orgId: orgId!, role }),
      ]);
      return {
        orgName: (orgRow?.name as string) ?? 'Organisation',
        stats,
      };
    },
  });

  const canCompose = canComposeBroadcast(role);
  const showPrimaryCompose = canCompose && !isBroadcastDraftOnlyRole(role);

  if (!configured || !isSupabaseConfigured()) {
    return (
      <TabSafeScreen>
        <View style={[styles.screen, { backgroundColor: tokens.background }]}>
          <Text style={{ color: tokens.textSecondary }}>
            Connect Supabase (EXPO_PUBLIC_SUPABASE_URL / ANON_KEY) to load your dashboard.
          </Text>
        </View>
      </TabSafeScreen>
    );
  }

  if (!profile || profile.status !== 'active' || !orgId) {
    return (
      <TabSafeScreen>
        <View style={[styles.screen, { backgroundColor: tokens.background }]}>
          <EmptyState
            title="Almost there"
            description="Finish registration on web or complete pending approval to see your dashboard."
          />
        </View>
      </TabSafeScreen>
    );
  }

  const orgName = dashboardQuery.data?.orgName ?? '…';
  const stats = dashboardQuery.data?.stats;

  return (
    <TabSafeScreen>
      <View style={[styles.screen, { backgroundColor: tokens.background }]}>
        <Text style={[styles.title, { color: tokens.textPrimary }]}>Dashboard</Text>
        <Text style={[styles.sub, { color: tokens.textSecondary }]}>
          {orgName}
          {dashboardQuery.isFetching ? ' · updating…' : ''}
        </Text>

        {dashboardQuery.isLoading ? (
          <Text style={[styles.muted, { color: tokens.textSecondary }]}>Loading…</Text>
        ) : stats ? (
          <View style={styles.kpiRow}>
            {stats.broadcastTotal !== undefined ? (
              <Card style={[styles.kpiCard, { borderColor: tokens.border }]}>
                <Text style={[styles.kpiLabel, { color: tokens.textSecondary }]}>Broadcasts sent</Text>
                <Text style={[styles.kpiValue, { color: tokens.textPrimary }]}>{stats.broadcastTotal}</Text>
                <Text style={[styles.kpiHint, { color: tokens.textMuted }]}>
                  {stats.statScope === 'dept' ? 'Your department(s)' : 'Whole organisation'}
                </Text>
              </Card>
            ) : null}
            <Card style={[styles.kpiCard, { borderColor: tokens.border }]}>
              <Text style={[styles.kpiLabel, { color: tokens.textSecondary }]}>Active members</Text>
              <Text style={[styles.kpiValue, { color: tokens.textPrimary }]}>{stats.memberActiveTotal}</Text>
              <Text style={[styles.kpiHint, { color: tokens.textMuted }]}>
                {stats.statScope === 'dept' ? 'In your department(s)' : 'In the organisation'}
              </Text>
            </Card>
          </View>
        ) : (
          <Card style={[styles.hintCard, { borderColor: tokens.border }]}>
            <Text style={[styles.hintTitle, { color: tokens.textPrimary }]}>Your feed</Text>
            <Text style={[styles.hintBody, { color: tokens.textSecondary }]}>
              Open Broadcasts for updates. KPI totals are available to managers, coordinators, and org
              admins on this device too — if you don't see numbers, your role uses a simplified home
              view.
            </Text>
          </Card>
        )}

        <View style={styles.actions}>
          <Pressable
            onPress={() => router.push('/(tabs)/broadcasts')}
            style={({ pressed }) => [
              styles.actionBtn,
              { backgroundColor: tokens.textPrimary, opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <Text style={[styles.actionBtnText, { color: tokens.background }]}>Broadcasts</Text>
          </Pressable>
          {showPrimaryCompose ? (
            <Text style={[styles.composeHint, { color: tokens.textSecondary }]}>
              Compose on web for full drafting and scheduling.
            </Text>
          ) : canCompose ? (
            <Text style={[styles.composeHint, { color: tokens.textSecondary }]}>
              Submit drafts for approval on web — same account.
            </Text>
          ) : null}
        </View>
      </View>
    </TabSafeScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 20, gap: 16 },
  title: { fontSize: 22, fontWeight: '700' },
  sub: { fontSize: 14, lineHeight: 20 },
  muted: { marginTop: 8, fontSize: 14 },
  kpiRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  kpiCard: { flex: 1, padding: 14, borderWidth: 1, borderRadius: 12, minWidth: 0 },
  kpiLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  kpiValue: { fontSize: 28, fontWeight: '700', marginTop: 6 },
  kpiHint: { fontSize: 12, marginTop: 4 },
  hintCard: { padding: 16, borderWidth: 1, borderRadius: 12, marginTop: 4 },
  hintTitle: { fontSize: 16, fontWeight: '600' },
  hintBody: { marginTop: 8, fontSize: 14, lineHeight: 21 },
  actions: { marginTop: 8, gap: 10 },
  actionBtn: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: 10, alignSelf: 'flex-start' },
  actionBtnText: { fontSize: 15, fontWeight: '600' },
  composeHint: { fontSize: 13, lineHeight: 19, maxWidth: 320 },
});
