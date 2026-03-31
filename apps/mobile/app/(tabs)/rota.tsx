import { canFinalApproveRotaRequests, canViewRotaDepartmentScope } from '@campsite/types';
import { useCampsiteTheme } from '@campsite/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { TabSafeScreen } from '@/components/shell/TabSafeScreen';
import { useAuth } from '@/lib/AuthContext';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const diff = day === 0 ? 6 : day - 1;
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfWeekExclusive(weekStart: Date): Date {
  const e = new Date(weekStart);
  e.setDate(e.getDate() + 7);
  return e;
}

type ShiftRow = {
  id: string;
  user_id: string | null;
  role_label: string | null;
  start_time: string;
  end_time: string;
  rotas: { title: string } | null;
};

function firstRotaTitle(
  rotas: { title: string } | { title: string }[] | null | undefined
): { title: string } | null {
  if (rotas == null) return null;
  if (Array.isArray(rotas)) return rotas[0] ?? null;
  return rotas;
}

function mapShiftRows(raw: unknown[]): ShiftRow[] {
  return raw.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: row.id as string,
      user_id: (row.user_id as string | null) ?? null,
      role_label: (row.role_label as string | null) ?? null,
      start_time: row.start_time as string,
      end_time: row.end_time as string,
      rotas: firstRotaTitle(row.rotas as { title: string } | { title: string }[] | null),
    };
  });
}

function localeTimeZoneOpts(iana: string | null | undefined): Pick<Intl.DateTimeFormatOptions, 'timeZone'> {
  const z = iana?.trim();
  if (!z) return {};
  try {
    Intl.DateTimeFormat(undefined, { timeZone: z });
    return { timeZone: z };
  } catch {
    return {};
  }
}

function shiftsTimeOverlap(a: ShiftRow, b: ShiftRow): boolean {
  if (!a.user_id || !b.user_id || a.user_id !== b.user_id) return false;
  const as = new Date(a.start_time).getTime();
  const ae = new Date(a.end_time).getTime();
  const bs = new Date(b.start_time).getTime();
  const be = new Date(b.end_time).getTime();
  return as < be && bs < ae;
}

function shiftPickLabel(s: ShiftRow, orgTz: string | null | undefined): string {
  const o = localeTimeZoneOpts(orgTz);
  const t = new Date(s.start_time).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...o,
  });
  return `${t}${s.rotas?.title ? ` · ${s.rotas.title}` : ''}`;
}

export default function RotaScreen() {
  const { tokens } = useCampsiteTheme();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'my' | 'team'>('my');
  const [swapMine, setSwapMine] = useState('');
  const [swapOther, setSwapOther] = useState('');
  const [changeShift, setChangeShift] = useState('');
  const [changeNote, setChangeNote] = useState('');
  const weekStart = useMemo(() => startOfWeekMonday(new Date()), []);
  const from = weekStart.toISOString();
  const to = endOfWeekExclusive(weekStart).toISOString();

  const orgTzQuery = useQuery({
    queryKey: ['mobile-org-timezone', profile?.org_id],
    enabled: Boolean(profile?.org_id && isSupabaseConfigured()),
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('organisations')
        .select('timezone')
        .eq('id', profile!.org_id)
        .maybeSingle();
      if (error) throw error;
      return (data?.timezone as string | null) ?? null;
    },
  });

  const orgTz = orgTzQuery.data ?? null;

  const canTeam = profile?.role ? canViewRotaDepartmentScope(profile.role) : false;
  const canApprove = profile?.role ? canFinalApproveRotaRequests(profile.role) : false;

  const shiftsQuery = useQuery({
    queryKey: ['mobile-rota-shifts', profile?.org_id, profile?.id, tab, from, to],
    enabled: Boolean(profile?.org_id && isSupabaseConfigured()),
    queryFn: async () => {
      const supabase = getSupabase();
      let q = supabase
        .from('rota_shifts')
        .select('id,user_id,role_label,start_time,end_time,rotas(title)')
        .eq('org_id', profile!.org_id)
        .gte('start_time', from)
        .lt('start_time', to)
        .order('start_time');
      if (tab === 'my') {
        q = q.eq('user_id', profile!.id);
      }
      const { data, error } = await q;
      if (error) throw error;
      return mapShiftRows(data ?? []);
    },
  });

  const managedDeptsQuery = useQuery({
    queryKey: ['mobile-dept-managers', profile?.id],
    enabled: Boolean(profile?.id && tab === 'team' && profile.role === 'manager' && isSupabaseConfigured()),
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('dept_managers')
        .select('dept_id')
        .eq('user_id', profile!.id);
      if (error) throw error;
      return (data ?? []).map((r) => r.dept_id as string);
    },
  });

  const teamShiftsQuery = useQuery({
    queryKey: [
      'mobile-rota-team-shifts',
      profile?.org_id,
      managedDeptsQuery.data,
      from,
      to,
    ],
    enabled:
      Boolean(
        profile?.org_id &&
          tab === 'team' &&
          isSupabaseConfigured() &&
          (profile.role !== 'manager' || (managedDeptsQuery.data?.length ?? 0) > 0)
      ),
    queryFn: async () => {
      const supabase = getSupabase();
      let q = supabase
        .from('rota_shifts')
        .select('id,user_id,role_label,start_time,end_time,rotas(title)')
        .eq('org_id', profile!.org_id)
        .gte('start_time', from)
        .lt('start_time', to)
        .order('start_time');
      if (profile!.role === 'manager' && managedDeptsQuery.data?.length) {
        q = q.in('dept_id', managedDeptsQuery.data);
      }
      const { data, error } = await q;
      if (error) throw error;
      return mapShiftRows(data ?? []);
    },
  });

  const visibleShiftsQuery = useQuery({
    queryKey: ['mobile-rota-visible-week', profile?.org_id, from, to],
    enabled: Boolean(profile?.org_id && isSupabaseConfigured()),
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('rota_shifts')
        .select('id,user_id,role_label,start_time,end_time,rotas(title)')
        .eq('org_id', profile!.org_id)
        .gte('start_time', from)
        .lt('start_time', to)
        .order('start_time');
      if (error) throw error;
      return mapShiftRows(data ?? []);
    },
  });

  const mySwapShifts = useMemo(
    () => (visibleShiftsQuery.data ?? []).filter((s) => s.user_id === profile?.id),
    [visibleShiftsQuery.data, profile?.id],
  );
  const otherSwapShifts = useMemo(
    () =>
      (visibleShiftsQuery.data ?? []).filter((s) => s.user_id && s.user_id !== profile?.id),
    [visibleShiftsQuery.data, profile?.id],
  );

  const requestsQuery = useQuery({
    queryKey: ['mobile-rota-requests', profile?.org_id],
    enabled: Boolean(profile?.org_id && isSupabaseConfigured()),
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('rota_change_requests')
        .select('id,request_type,status,created_at,counterparty_user_id')
        .eq('org_id', profile!.org_id)
        .order('created_at', { ascending: false })
        .limit(40);
      if (error) throw error;
      return data ?? [];
    },
  });

  const displayShifts = tab === 'my' ? shiftsQuery.data ?? [] : teamShiftsQuery.data ?? [];

  const overlapShiftIds = useMemo(() => {
    const s = new Set<string>();
    const list = displayShifts;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (shiftsTimeOverlap(list[i]!, list[j]!)) {
          s.add(list[i]!.id);
          s.add(list[j]!.id);
        }
      }
    }
    return s;
  }, [displayShifts]);

  const loading =
    tab === 'my'
      ? shiftsQuery.isPending
      : profile?.role === 'manager'
        ? managedDeptsQuery.isPending || teamShiftsQuery.isPending
        : teamShiftsQuery.isPending;

  const claimMut = useMutation({
    mutationFn: async (shiftId: string) => {
      const supabase = getSupabase();
      const { error } = await supabase.rpc('rota_claim_open_shift', { p_shift_id: shiftId });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mobile-rota-shifts'] });
      void qc.invalidateQueries({ queryKey: ['mobile-rota-team-shifts'] });
      void qc.invalidateQueries({ queryKey: ['mobile-rota-visible-week'] });
    },
  });

  const approveMut = useMutation({
    mutationFn: async (requestId: string) => {
      const supabase = getSupabase();
      const { error } = await supabase.rpc('rota_change_request_final_approve', {
        p_request_id: requestId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mobile-rota-requests'] });
      void qc.invalidateQueries({ queryKey: ['mobile-rota-shifts'] });
      void qc.invalidateQueries({ queryKey: ['mobile-rota-visible-week'] });
    },
  });

  const peerAcceptMut = useMutation({
    mutationFn: async (requestId: string) => {
      const supabase = getSupabase();
      const { error } = await supabase.rpc('rota_change_request_peer_accept', {
        p_request_id: requestId,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['mobile-rota-requests'] }),
  });

  const submitSwapMut = useMutation({
    mutationFn: async () => {
      const supabase = getSupabase();
      const { error } = await supabase.rpc('rota_change_request_submit_swap', {
        p_primary_shift_id: swapMine,
        p_counterparty_shift_id: swapOther,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setSwapMine('');
      setSwapOther('');
      void qc.invalidateQueries({ queryKey: ['mobile-rota-requests'] });
      void qc.invalidateQueries({ queryKey: ['mobile-rota-visible-week'] });
      Alert.alert('Sent', 'Swap request submitted.');
    },
  });

  const submitChangeMut = useMutation({
    mutationFn: async () => {
      const supabase = getSupabase();
      const { error } = await supabase.rpc('rota_change_request_submit_change', {
        p_shift_id: changeShift,
        p_note: changeNote.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setChangeNote('');
      void qc.invalidateQueries({ queryKey: ['mobile-rota-requests'] });
      void qc.invalidateQueries({ queryKey: ['mobile-rota-visible-week'] });
      Alert.alert('Sent', 'Change request submitted.');
    },
  });

  if (!profile?.org_id) {
    return (
      <TabSafeScreen>
        <View style={[styles.center, { backgroundColor: tokens.background }]}>
          <Text style={{ color: tokens.textSecondary }}>Sign in to view your rota.</Text>
        </View>
      </TabSafeScreen>
    );
  }

  const pendingFinal = (requestsQuery.data ?? []).filter(
    (r: { status: string }) => r.status === 'pending_final'
  );
  const pendingPeer = (requestsQuery.data ?? []).filter(
    (r: { status: string; counterparty_user_id: string | null }) =>
      r.status === 'pending_peer' && r.counterparty_user_id === profile.id
  );

  return (
    <TabSafeScreen>
      <ScrollView
        style={{ flex: 1, backgroundColor: tokens.background }}
        contentContainerStyle={styles.scrollPad}
        refreshControl={
          <RefreshControl
            refreshing={
              shiftsQuery.isRefetching ||
              teamShiftsQuery.isRefetching ||
              requestsQuery.isRefetching ||
              visibleShiftsQuery.isRefetching ||
              orgTzQuery.isRefetching
            }
            onRefresh={() => {
              void shiftsQuery.refetch();
              void teamShiftsQuery.refetch();
              void requestsQuery.refetch();
              void visibleShiftsQuery.refetch();
              void orgTzQuery.refetch();
            }}
          />
        }
      >
        <Text style={[styles.title, { color: tokens.textPrimary }]}>Rota</Text>
        <Text style={[styles.sub, { color: tokens.textSecondary }]}>This week · schedules & requests</Text>

        <View style={styles.tabs}>
          <Pressable
            onPress={() => setTab('my')}
            style={[
              styles.tab,
              tab === 'my' && {
                backgroundColor: tokens.textPrimary,
                borderColor: tokens.textPrimary,
              },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                { color: tab === 'my' ? tokens.background : tokens.textPrimary },
              ]}
            >
              My schedule
            </Text>
          </Pressable>
          {canTeam ? (
            <Pressable
              onPress={() => setTab('team')}
              style={[
                styles.tab,
                tab === 'team' && {
                  backgroundColor: tokens.textPrimary,
                  borderColor: tokens.textPrimary,
                },
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: tab === 'team' ? tokens.background : tokens.textPrimary },
                ]}
              >
                {profile.role === 'manager' ? 'Department' : 'Team'}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {tab === 'team' && profile.role === 'manager' && (managedDeptsQuery.data?.length ?? 0) === 0 ? (
          <Text style={[styles.empty, { color: tokens.textSecondary }]}>
            No managed departments - team view is empty.
          </Text>
        ) : loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={tokens.textPrimary} />
        ) : displayShifts.length === 0 ? (
          <Text style={[styles.empty, { color: tokens.textSecondary }]}>No shifts this week.</Text>
        ) : (
          displayShifts.map((s) => (
            <View
              key={s.id}
              style={[styles.card, { borderColor: tokens.border, backgroundColor: tokens.surface }]}
            >
              <Text style={[styles.cardTitle, { color: tokens.textPrimary }]}>
                {s.rotas?.title?.trim() || 'Shift'} ·{' '}
                {new Date(s.start_time).toLocaleString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  ...localeTimeZoneOpts(orgTz),
                })}
              </Text>
              {overlapShiftIds.has(s.id) ? (
                <Text style={[styles.overlapBadge, { color: '#92400e' }]}>Overlap</Text>
              ) : null}
              {s.role_label ? (
                <Text style={[styles.cardMeta, { color: tokens.textSecondary }]}>{s.role_label}</Text>
              ) : null}
              {s.user_id === null ? (
                <Pressable
                  style={[styles.btn, { borderColor: tokens.border }]}
                  onPress={() =>
                    claimMut.mutate(s.id, {
                      onError: (e: Error) => Alert.alert('Could not claim', e.message),
                    })
                  }
                >
                  <Text style={{ color: tokens.textPrimary }}>Claim open slot</Text>
                </Pressable>
              ) : null}
            </View>
          ))
        )}

        <View style={{ marginTop: 24 }}>
          <Text style={[styles.section, { color: tokens.textPrimary }]}>New requests</Text>
          <Text style={[styles.cardMeta, { marginTop: 6, marginBottom: 8, color: tokens.textSecondary }]}>
            Swap shifts or ask to be unassigned (same flow as web).
          </Text>
          <Text style={[styles.cardMeta, { marginTop: 8, color: tokens.textSecondary }]}>Your shift</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
            {mySwapShifts.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => setSwapMine(s.id)}
                style={[
                  styles.chip,
                  { borderColor: tokens.border, backgroundColor: tokens.surface },
                  swapMine === s.id && { borderColor: tokens.textPrimary, borderWidth: 2 },
                ]}
              >
                <Text style={{ fontSize: 12, color: tokens.textPrimary }}>{shiftPickLabel(s, orgTz)}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={[styles.cardMeta, { marginTop: 10, color: tokens.textSecondary }]}>Their shift</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
            {otherSwapShifts.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => setSwapOther(s.id)}
                style={[
                  styles.chip,
                  { borderColor: tokens.border, backgroundColor: tokens.surface },
                  swapOther === s.id && { borderColor: tokens.textPrimary, borderWidth: 2 },
                ]}
              >
                <Text style={{ fontSize: 12, color: tokens.textPrimary }}>{shiftPickLabel(s, orgTz)}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable
            style={[styles.btn, { borderColor: tokens.border, marginTop: 10 }]}
            onPress={() => {
              if (!swapMine || !swapOther) {
                Alert.alert('Pick both shifts', 'Select your shift and their shift.');
                return;
              }
              submitSwapMut.mutate(undefined, {
                onError: (e: Error) => Alert.alert('Swap failed', e.message),
              });
            }}
          >
            <Text style={{ color: tokens.textPrimary }}>Submit swap request</Text>
          </Pressable>

          <Text style={[styles.cardMeta, { marginTop: 16, color: tokens.textSecondary }]}>Request unassign</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
            {mySwapShifts.map((s) => (
              <Pressable
                key={`c-${s.id}`}
                onPress={() => setChangeShift(s.id)}
                style={[
                  styles.chip,
                  { borderColor: tokens.border, backgroundColor: tokens.surface },
                  changeShift === s.id && { borderColor: tokens.textPrimary, borderWidth: 2 },
                ]}
              >
                <Text style={{ fontSize: 12, color: tokens.textPrimary }}>{shiftPickLabel(s, orgTz)}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <TextInput
            style={[
              styles.input,
              { borderColor: tokens.border, color: tokens.textPrimary, marginTop: 8 },
            ]}
            placeholder="Note to approvers (optional)"
            placeholderTextColor={tokens.textMuted}
            value={changeNote}
            onChangeText={setChangeNote}
            multiline
          />
          <Pressable
            style={[styles.btn, { borderColor: tokens.border, marginTop: 8 }]}
            onPress={() => {
              if (!changeShift) {
                Alert.alert('Pick a shift', 'Select one of your shifts.');
                return;
              }
              submitChangeMut.mutate(undefined, {
                onError: (e: Error) => Alert.alert('Request failed', e.message),
              });
            }}
          >
            <Text style={{ color: tokens.textPrimary }}>Submit unassign request</Text>
          </Pressable>
        </View>

        {pendingPeer.length > 0 ? (
          <View style={{ marginTop: 24 }}>
            <Text style={[styles.section, { color: tokens.textPrimary }]}>Swap - your OK</Text>
            {pendingPeer.map((r: { id: string }) => (
              <Pressable
                key={r.id}
                style={[styles.btn, { borderColor: tokens.border, marginTop: 8 }]}
                onPress={() =>
                  peerAcceptMut.mutate(r.id, {
                    onError: (e: Error) => Alert.alert('Error', e.message),
                  })
                }
              >
                <Text style={{ color: tokens.textPrimary }}>Accept swap</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {canApprove && pendingFinal.length > 0 ? (
          <View style={{ marginTop: 24 }}>
            <Text style={[styles.section, { color: tokens.textPrimary }]}>Awaiting approval</Text>
            {pendingFinal.map((r: { id: string; request_type: string }) => (
              <View
                key={r.id}
                style={[styles.card, { borderColor: tokens.border, backgroundColor: tokens.surface }]}
              >
                <Text style={{ color: tokens.textPrimary }}>{r.request_type}</Text>
                <Pressable
                  style={[styles.btn, { borderColor: '#047857', marginTop: 8 }]}
                  onPress={() =>
                    approveMut.mutate(r.id, {
                      onError: (e: Error) => Alert.alert('Error', e.message),
                    })
                  }
                >
                  <Text style={{ color: '#047857' }}>Approve</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </TabSafeScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  scrollPad: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '600' },
  sub: { marginTop: 6, fontSize: 14 },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 16 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d8d8d8',
  },
  tabText: { fontSize: 13, fontWeight: '500' },
  empty: { marginTop: 20, fontSize: 14 },
  card: {
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  cardTitle: { fontSize: 15, fontWeight: '600' },
  overlapBadge: {
    marginTop: 6,
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#fef3c7',
  },
  cardMeta: { marginTop: 4, fontSize: 13 },
  section: { fontSize: 16, fontWeight: '600' },
  btn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  chip: {
    marginRight: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 220,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    minHeight: 44,
  },
});
