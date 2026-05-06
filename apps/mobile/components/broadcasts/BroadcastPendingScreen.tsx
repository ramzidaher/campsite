import { isBroadcastApproverRole, type ProfileRole } from '@campsite/types';
import { useCampsiteTheme } from '@campsite/ui';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AppMobileHeader } from '@/components/shell/AppMobileHeader';
import { useAuth } from '@/lib/AuthContext';
import { getSupabase } from '@/lib/supabase';

type PendingBroadcast = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  dept_name: string | null;
  channel_name: string | null;
  author_name: string | null;
  is_org_wide: boolean;
};

function preview(md: string): string {
  return md.replace(/\n+/g, ' ').replace(/[#*_`]/g, '').slice(0, 160);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '';
  }
}

async function fetchPendingBroadcasts(
  userId: string,
  orgId: string,
  role: string,
): Promise<PendingBroadcast[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('broadcasts')
    .select(`
      id, title, body, created_at, is_org_wide, dept_id,
      author:profiles!broadcasts_author_id_fkey(full_name),
      department:departments(name),
      channel:broadcast_channels(name)
    `)
    .eq('org_id', orgId)
    .eq('status', 'pending_approval')
    .order('created_at', { ascending: false });

  if (error) throw error;

  let rows = (data ?? []) as Record<string, unknown>[];

  // Managers only see broadcasts from their managed departments
  if (role === 'manager') {
    const { data: managed } = await supabase
      .from('dept_managers')
      .select('dept_id')
      .eq('user_id', userId);
    const managedDeptIds = new Set((managed ?? []).map((m) => m.dept_id as string));
    rows = rows.filter((r) => managedDeptIds.has(r.dept_id as string));
  } else if (role === 'coordinator') {
    const { data: ud } = await supabase
      .from('user_departments')
      .select('dept_id')
      .eq('user_id', userId);
    const deptIds = new Set((ud ?? []).map((u) => u.dept_id as string));
    rows = rows.filter((r) => deptIds.has(r.dept_id as string));
  }

  function relOne<T>(v: T | T[] | null | undefined): T | null {
    if (v == null) return null;
    return Array.isArray(v) ? (v[0] ?? null) : v;
  }

  return rows.map((r) => ({
    id: r.id as string,
    title: r.title as string,
    body: r.body as string,
    created_at: r.created_at as string,
    is_org_wide: Boolean(r.is_org_wide),
    dept_name: (relOne(r.department as { name: string } | null))?.name ?? null,
    channel_name: (relOne(r.channel as { name: string } | null))?.name ?? null,
    author_name: (relOne(r.author as { full_name: string } | null))?.full_name ?? null,
  }));
}

export function BroadcastPendingScreen() {
  const { tokens, scheme } = useCampsiteTheme();
  const { profile } = useAuth();
  const [rows, setRows] = useState<PendingBroadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const cardBg = scheme === 'dark' ? tokens.surface : '#ffffff';

  const role = (profile?.role ?? 'worker') as ProfileRole;
  const canApprove = isBroadcastApproverRole(role);

  const load = useCallback(async () => {
    if (!profile?.id || !profile.org_id) return;
    try {
      const data = await fetchPendingBroadcasts(profile.id, profile.org_id, role);
      setRows(data);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not load pending broadcasts');
    }
  }, [profile?.id, profile?.org_id, role]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load().finally(() => setLoading(false));
    }, [load]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load().finally(() => setRefreshing(false));
  }, [load]);

  const handleApprove = useCallback(
    async (id: string) => {
      setBusyId(id);
      const { error } = await getSupabase().rpc('decide_pending_broadcast', {
        p_broadcast_id: id,
        p_action: 'approve_send',
      });
      setBusyId(null);
      if (error) {
        Alert.alert('Error', error.message);
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== id));
    },
    [],
  );

  const handleReject = useCallback(
    (id: string) => {
      Alert.prompt(
        'Reject broadcast',
        'Optional: add a note for the author.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Reject',
            style: 'destructive',
            onPress: async (note: string | undefined) => {
              setBusyId(id);
              const { error } = await getSupabase().rpc('decide_pending_broadcast', {
                p_broadcast_id: id,
                p_action: 'reject',
                p_rejection_note: note ?? '',
              });
              setBusyId(null);
              if (error) {
                Alert.alert('Error', error.message);
                return;
              }
              setRows((prev) => prev.filter((r) => r.id !== id));
            },
          },
        ],
        'plain-text',
      );
    },
    [],
  );

  // Android doesn't have Alert.prompt  use a state-based modal instead
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const confirmReject = useCallback(async () => {
    if (!rejectTarget) return;
    const id = rejectTarget;
    setRejectTarget(null);
    setRejectNote('');
    setBusyId(id);
    const { error } = await getSupabase().rpc('decide_pending_broadcast', {
      p_broadcast_id: id,
      p_action: 'reject',
      p_rejection_note: rejectNote,
    });
    setBusyId(null);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
  }, [rejectTarget, rejectNote]);

  const onRejectPress = useCallback(
    (id: string) => {
      if (Platform.OS === 'ios') {
        handleReject(id);
      } else {
        setRejectNote('');
        setRejectTarget(id);
      }
    },
    [handleReject],
  );

  if (!canApprove) {
    return (
      <View style={[styles.screen, { backgroundColor: tokens.background }]}>
        <AppMobileHeader />
        <View style={styles.center}>
          <Text style={{ color: tokens.textSecondary }}>You don't have permission to approve broadcasts.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: tokens.background }]}>
      <AppMobileHeader />

      {/* Android reject modal */}
      {rejectTarget ? (
        <View style={[styles.rejectOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.rejectModal, { backgroundColor: tokens.surface, borderColor: tokens.border }]}>
            <Text style={[styles.rejectTitle, { color: tokens.textPrimary }]}>Reject broadcast</Text>
            <Text style={[styles.rejectSub, { color: tokens.textSecondary }]}>Optional: add a note for the author.</Text>
            <TextInput
              value={rejectNote}
              onChangeText={setRejectNote}
              placeholder="Rejection note…"
              placeholderTextColor={tokens.textMuted}
              style={[
                styles.rejectInput,
                { borderColor: tokens.border, color: tokens.textPrimary, backgroundColor: tokens.background },
              ]}
              multiline
            />
            <View style={styles.rejectBtnRow}>
              <Pressable
                style={[styles.rejectBtn, { borderColor: tokens.border }]}
                onPress={() => { setRejectTarget(null); setRejectNote(''); }}
              >
                <Text style={{ color: tokens.textSecondary, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.rejectBtn, styles.rejectBtnDestructive]}
                onPress={() => void confirmReject()}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>Reject</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={tokens.textPrimary} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refresh()}
              tintColor={tokens.textPrimary}
              colors={[tokens.textPrimary]}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={[styles.emptyTitle, { color: tokens.textPrimary }]}>All clear</Text>
              <Text style={[styles.emptySub, { color: tokens.textSecondary }]}>No broadcasts waiting for approval.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const busy = busyId === item.id;
            return (
              <View
                style={[
                  styles.card,
                  { backgroundColor: cardBg, borderColor: tokens.border },
                ]}
              >
                <Text style={[styles.cardTitle, { color: tokens.textPrimary }]} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={[styles.cardMeta, { color: tokens.textMuted }]} numberOfLines={1}>
                  {[
                    item.author_name,
                    item.dept_name,
                    item.is_org_wide ? 'All channels' : item.channel_name,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                <Text style={[styles.cardDate, { color: tokens.textMuted }]}>
                  {formatDate(item.created_at)}
                </Text>
                <Text style={[styles.cardBody, { color: tokens.textSecondary }]} numberOfLines={3}>
                  {preview(item.body)}
                </Text>
                <View style={styles.cardActions}>
                  <Pressable
                    style={[styles.actionBtn, styles.approveBtn, { opacity: busy ? 0.5 : 1 }]}
                    onPress={() => void handleApprove(item.id)}
                    disabled={busy}
                  >
                    {busy ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.approveBtnText}>Approve & send</Text>
                    )}
                  </Pressable>
                  <Pressable
                    style={[styles.actionBtn, styles.rejectBtnOutline, { borderColor: tokens.border, opacity: busy ? 0.5 : 1 }]}
                    onPress={() => onRejectPress(item.id)}
                    disabled={busy}
                  >
                    <Text style={[styles.rejectBtnOutlineText, { color: tokens.textSecondary }]}>Reject</Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  list: { padding: 16, paddingBottom: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginBottom: 6 },
  emptySub: { fontSize: 14, textAlign: 'center' },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 },
      android: { elevation: 1 },
    }),
  },
  cardTitle: { fontSize: 15, fontWeight: '700', lineHeight: 21, marginBottom: 4 },
  cardMeta: { fontSize: 12, marginBottom: 2 },
  cardDate: { fontSize: 11, marginBottom: 8 },
  cardBody: { fontSize: 13, lineHeight: 19, marginBottom: 14 },
  cardActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  approveBtn: { backgroundColor: '#008B60' },
  approveBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  rejectBtnOutline: { borderWidth: 1 },
  rejectBtnOutlineText: { fontWeight: '600', fontSize: 14 },
  // Android reject modal
  rejectOverlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 100,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  rejectModal: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  rejectTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  rejectSub: { fontSize: 13, marginBottom: 12 },
  rejectInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  rejectBtnRow: { flexDirection: 'row', gap: 8 },
  rejectBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  rejectBtnDestructive: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
});
