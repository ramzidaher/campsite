import DateTimePicker from '@react-native-community/datetimepicker';
import { useCampsiteTheme } from '@campsite/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { ProfileRow } from '@/lib/AuthContext';
import { getSupabase } from '@/lib/supabase';

type LeaveRequest = {
  id: string;
  kind: string;
  start_date: string;
  end_date: string;
  status: string;
  note: string | null;
  created_at: string;
  requester_id?: string;
  requester_name?: string;
};

type AllowanceRow = {
  annual_entitlement_days: number;
  toil_balance_days: number;
};

function daysBetween(start: string, end: string): number {
  const a = new Date(`${start}T12:00:00Z`);
  const b = new Date(`${end}T12:00:00Z`);
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function statusLabel(s: string): { text: string; color: string } {
  switch (s) {
    case 'approved':
      return { text: 'Approved', color: '#166534' };
    case 'rejected':
      return { text: 'Declined', color: '#b91c1c' };
    case 'cancelled':
      return { text: 'Cancelled', color: '#9b9b9b' };
    default:
      return { text: 'Awaiting approval', color: '#c2410c' };
  }
}

function kindLabel(k: string): string {
  return k === 'toil' ? 'Time off in lieu (TOIL)' : 'Annual leave';
}

export function LeaveScreen({ profile }: { profile: ProfileRow }) {
  const { tokens, scheme } = useCampsiteTheme();
  const isDark = scheme === 'dark';
  const supabase = useMemo(() => getSupabase(), []);

  const [allowance, setAllowance] = useState<AllowanceRow | null>(null);
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [pendingForMe, setPendingForMe] = useState<LeaveRequest[]>([]);
  const [canSubmit, setCanSubmit] = useState(false);
  const [canApprove, setCanApprove] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  // Form state
  const [formKind, setFormKind] = useState<'annual' | 'toil'>('annual');
  const [formStart, setFormStart] = useState(new Date());
  const [formEnd, setFormEnd] = useState(new Date());
  const [formNote, setFormNote] = useState('');
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [section, setSection] = useState<'mine' | 'approve'>('mine');

  const year = String(new Date().getFullYear());
  const orgId = profile.org_id ?? '';
  const userId = profile.id;

  const load = useCallback(async () => {
    if (!orgId) return;
    const [{ data: permsData }, { data: al }, { data: mine }] = await Promise.all([
      supabase.rpc('get_my_permissions', { p_org_id: orgId }),
      supabase
        .from('leave_allowances')
        .select('annual_entitlement_days, toil_balance_days')
        .eq('org_id', orgId)
        .eq('user_id', userId)
        .eq('leave_year', year)
        .maybeSingle(),
      supabase
        .from('leave_requests')
        .select('id, kind, start_date, end_date, status, note, created_at')
        .eq('org_id', orgId)
        .eq('requester_id', userId)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    const keys = ((permsData ?? []) as Array<{ permission_key?: string }>).map((p) =>
      String(p.permission_key ?? ''),
    );
    const submit = keys.includes('leave.submit');
    const approve =
      keys.includes('leave.approve_direct_reports') || keys.includes('leave.manage_org');
    setCanSubmit(submit);
    setCanApprove(approve);

    setAllowance(
      al
        ? {
            annual_entitlement_days: Number(al.annual_entitlement_days ?? 0),
            toil_balance_days: Number(al.toil_balance_days ?? 0),
          }
        : { annual_entitlement_days: 0, toil_balance_days: 0 },
    );
    setMyRequests((mine ?? []) as LeaveRequest[]);

    if (approve) {
      const isManager = keys.includes('leave.manage_org');
      let pend: LeaveRequest[] = [];
      if (isManager) {
        const { data } = await supabase
          .from('leave_requests')
          .select('id, requester_id, kind, start_date, end_date, status, note, created_at')
          .eq('org_id', orgId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false });
        pend = (data ?? []) as LeaveRequest[];
      } else {
        const { data: reps } = await supabase
          .from('profiles')
          .select('id')
          .eq('org_id', orgId)
          .eq('reports_to_user_id', userId);
        const ids = (reps ?? []).map((r) => r.id as string).filter(Boolean);
        if (ids.length) {
          const { data } = await supabase
            .from('leave_requests')
            .select('id, requester_id, kind, start_date, end_date, status, note, created_at')
            .eq('org_id', orgId)
            .eq('status', 'pending')
            .in('requester_id', ids)
            .order('created_at', { ascending: false });
          pend = (data ?? []) as LeaveRequest[];
        }
      }
      const nameIds = [...new Set(pend.map((r) => r.requester_id as string))];
      const nameMap: Record<string, string> = {};
      if (nameIds.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', nameIds);
        for (const p of profs ?? []) nameMap[p.id as string] = (p.full_name as string) ?? '';
      }
      setPendingForMe(pend.map((r) => ({ ...r, requester_name: nameMap[r.requester_id as string] ?? 'Team member' })));
    }
  }, [supabase, orgId, userId, year]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const usedAnnual = useMemo(() => {
    return myRequests
      .filter(
        (r) =>
          r.kind === 'annual' &&
          (r.status === 'approved' || r.status === 'pending') &&
          (r.start_date.startsWith(year) || r.end_date.startsWith(year)),
      )
      .reduce((acc, r) => acc + daysBetween(r.start_date, r.end_date), 0);
  }, [myRequests, year]);

  const entitlement = allowance?.annual_entitlement_days ?? 0;
  const remaining = Math.max(0, entitlement - usedAnnual);
  const toilBalance = allowance?.toil_balance_days ?? 0;

  async function submitLeave() {
    const start = toIsoDate(formStart);
    const end = toIsoDate(formEnd);
    if (end < start) {
      Alert.alert('Invalid dates', 'End date must be on or after start date.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('leave_request_submit', {
      p_kind: formKind,
      p_start: start,
      p_end: end,
      p_note: formNote.trim() || null,
    });
    setBusy(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setFormNote('');
    setShowForm(false);
    await load();
    Alert.alert('Submitted', 'Your leave request has been submitted for approval.');
  }

  async function cancelRequest(id: string) {
    Alert.alert('Cancel request?', 'This will withdraw your leave request.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel request',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          const { error } = await supabase.rpc('leave_request_cancel', { p_request_id: id });
          setBusy(false);
          if (error) Alert.alert('Error', error.message);
          else await load();
        },
      },
    ]);
  }

  async function decideRequest(id: string, approve: boolean, name: string) {
    const action = approve ? 'Approve' : 'Decline';
    Alert.alert(`${action} request?`, `${action} leave request from ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: action,
        style: approve ? 'default' : 'destructive',
        onPress: async () => {
          setBusy(true);
          const { error } = await supabase.rpc('leave_request_decide', {
            p_request_id: id,
            p_approve: approve,
            p_note: null,
          });
          setBusy(false);
          if (error) Alert.alert('Error', error.message);
          else await load();
        },
      },
    ]);
  }

  const bg = isDark ? tokens.background : '#faf9f6';
  const cardBg = isDark ? tokens.surface : '#ffffff';
  const border = isDark ? tokens.border : '#e8e8e8';
  const textPrimary = isDark ? tokens.textPrimary : '#121212';
  const textSecondary = isDark ? tokens.textSecondary : '#6b6b6b';

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: bg }}>
        <ActivityIndicator color={textSecondary} />
      </View>
    );
  }

  const formDays = daysBetween(toIsoDate(formStart), toIsoDate(formEnd));

  return (
    <ScrollView
        style={{ flex: 1, backgroundColor: bg }}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: textPrimary }]}>Time off</Text>
          <Text style={[styles.subtitle, { color: textSecondary }]}>
            Your leave balances and requests for {year}.
          </Text>
        </View>

        {/* Balance cards */}
        <View style={styles.balanceRow}>
          <View style={[styles.balanceCard, { backgroundColor: cardBg, borderColor: border }]}>
            <Text style={[styles.balanceNum, { color: textPrimary }]}>{entitlement}</Text>
            <Text style={[styles.balanceLabel, { color: textSecondary }]}>Days entitlement</Text>
          </View>
          <View style={[styles.balanceCard, { backgroundColor: cardBg, borderColor: border }]}>
            <Text style={[styles.balanceNum, { color: textPrimary }]}>{usedAnnual}</Text>
            <Text style={[styles.balanceLabel, { color: textSecondary }]}>Days used</Text>
          </View>
          <View style={[styles.balanceCard, { backgroundColor: '#f0fdf9', borderColor: '#bbf7d0' }]}>
            <Text style={[styles.balanceNum, { color: '#166534' }]}>{remaining}</Text>
            <Text style={[styles.balanceLabel, { color: '#166534' }]}>Days remaining</Text>
          </View>
        </View>
        {toilBalance > 0 ? (
          <View style={[styles.toilBanner, { backgroundColor: cardBg, borderColor: border }]}>
            <Text style={[styles.toilText, { color: textSecondary }]}>
              TOIL balance: <Text style={{ fontWeight: '600', color: textPrimary }}>{toilBalance} days</Text>
            </Text>
          </View>
        ) : null}

        {/* Section tabs */}
        {canApprove ? (
          <View style={[styles.segmentRow, { backgroundColor: isDark ? tokens.surface : '#f0eeea' }]}>
            {(['mine', 'approve'] as const).map((s) => (
              <Pressable
                key={s}
                style={[styles.segment, section === s && { backgroundColor: cardBg, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 }]}
                onPress={() => setSection(s)}
              >
                <Text style={[styles.segmentLabel, { color: section === s ? textPrimary : textSecondary, fontWeight: section === s ? '600' : '400' }]}>
                  {s === 'mine' ? 'My requests' : `Approve (${pendingForMe.length})`}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {section === 'mine' ? (
          <>
            {/* Request leave button */}
            {canSubmit ? (
              <Pressable
                style={[styles.primaryBtn, { backgroundColor: '#121212' }]}
                onPress={() => setShowForm((v) => !v)}
              >
                <Text style={styles.primaryBtnText}>{showForm ? 'Hide form' : '+ Request time off'}</Text>
              </Pressable>
            ) : null}

            {/* Request form */}
            {showForm && canSubmit ? (
              <View style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}>
                <Text style={[styles.cardTitle, { color: textPrimary }]}>New leave request</Text>

                {/* Kind */}
                <Text style={[styles.fieldLabel, { color: textSecondary }]}>Type</Text>
                <View style={[styles.segmentRow, { backgroundColor: isDark ? '#2a2a2a' : '#f0eeea', marginBottom: 12 }]}>
                  {(['annual', 'toil'] as const).map((k) => (
                    <Pressable
                      key={k}
                      style={[styles.segment, formKind === k && { backgroundColor: cardBg }]}
                      onPress={() => setFormKind(k)}
                    >
                      <Text style={[styles.segmentLabel, { color: formKind === k ? textPrimary : textSecondary, fontWeight: formKind === k ? '600' : '400' }]}>
                        {k === 'annual' ? 'Annual leave' : 'TOIL'}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* Dates */}
                <Text style={[styles.fieldLabel, { color: textSecondary }]}>Start date</Text>
                <Pressable
                  style={[styles.dateBtn, { borderColor: border, backgroundColor: isDark ? '#2a2a2a' : '#fafafa' }]}
                  onPress={() => setShowStartPicker(true)}
                >
                  <Text style={[styles.dateBtnText, { color: textPrimary }]}>{fmtDate(toIsoDate(formStart))}</Text>
                </Pressable>
                {showStartPicker ? (
                  <DateTimePicker
                    value={formStart}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_e, d) => {
                      setShowStartPicker(Platform.OS === 'ios');
                      if (d) setFormStart(d);
                    }}
                  />
                ) : null}

                <Text style={[styles.fieldLabel, { color: textSecondary }]}>End date</Text>
                <Pressable
                  style={[styles.dateBtn, { borderColor: border, backgroundColor: isDark ? '#2a2a2a' : '#fafafa' }]}
                  onPress={() => setShowEndPicker(true)}
                >
                  <Text style={[styles.dateBtnText, { color: textPrimary }]}>{fmtDate(toIsoDate(formEnd))}</Text>
                </Pressable>
                {showEndPicker ? (
                  <DateTimePicker
                    value={formEnd}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_e, d) => {
                      setShowEndPicker(Platform.OS === 'ios');
                      if (d) setFormEnd(d);
                    }}
                  />
                ) : null}

                <Text style={[styles.dayPreview, { color: '#008B60' }]}>
                  {formDays} day{formDays === 1 ? '' : 's'} selected
                </Text>

                <Text style={[styles.fieldLabel, { color: textSecondary }]}>Note (optional)</Text>
                <TextInput
                  value={formNote}
                  onChangeText={setFormNote}
                  placeholder="Reason or extra info…"
                  placeholderTextColor={textSecondary}
                  multiline
                  numberOfLines={3}
                  style={[styles.textArea, { borderColor: border, color: textPrimary, backgroundColor: isDark ? '#2a2a2a' : '#fafafa' }]}
                />

                <Pressable
                  style={[styles.primaryBtn, { marginTop: 12, backgroundColor: '#008B60', opacity: busy ? 0.6 : 1 }]}
                  onPress={() => void submitLeave()}
                  disabled={busy}
                >
                  <Text style={styles.primaryBtnText}>{busy ? 'Submitting…' : 'Submit request'}</Text>
                </Pressable>
              </View>
            ) : null}

            {/* My requests list */}
            <Text style={[styles.sectionHeading, { color: textSecondary }]}>My requests</Text>
            {myRequests.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: cardBg, borderColor: border }]}>
                <Text style={[styles.emptyText, { color: textSecondary }]}>No leave requests yet.</Text>
              </View>
            ) : (
              myRequests.map((r) => {
                const st = statusLabel(r.status);
                const days = daysBetween(r.start_date, r.end_date);
                return (
                  <View key={r.id} style={[styles.requestCard, { backgroundColor: cardBg, borderColor: border }]}>
                    <View style={styles.requestRow}>
                      <Text style={[styles.requestKind, { color: textPrimary }]}>{kindLabel(r.kind)}</Text>
                      <Text style={[styles.requestStatus, { color: st.color }]}>{st.text}</Text>
                    </View>
                    <Text style={[styles.requestDates, { color: textSecondary }]}>
                      {fmtDate(r.start_date)} – {fmtDate(r.end_date)} · {days} day{days === 1 ? '' : 's'}
                    </Text>
                    {r.note ? <Text style={[styles.requestNote, { color: textSecondary }]}>{r.note}</Text> : null}
                    {r.status === 'pending' ? (
                      <Pressable onPress={() => void cancelRequest(r.id)} style={styles.cancelBtn}>
                        <Text style={styles.cancelBtnText}>Cancel request</Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })
            )}
          </>
        ) : (
          <>
            {/* Approve section */}
            <Text style={[styles.sectionHeading, { color: textSecondary }]}>
              Pending requests ({pendingForMe.length})
            </Text>
            {pendingForMe.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: cardBg, borderColor: border }]}>
                <Text style={[styles.emptyText, { color: textSecondary }]}>No pending requests to review.</Text>
              </View>
            ) : (
              pendingForMe.map((r) => {
                const days = daysBetween(r.start_date, r.end_date);
                const name = r.requester_name ?? 'Team member';
                return (
                  <View key={r.id} style={[styles.requestCard, { backgroundColor: cardBg, borderColor: border }]}>
                    <Text style={[styles.requestKind, { color: textPrimary }]}>{name}</Text>
                    <Text style={[styles.requestDates, { color: textSecondary }]}>
                      {kindLabel(r.kind)} · {fmtDate(r.start_date)} – {fmtDate(r.end_date)} · {days} day{days === 1 ? '' : 's'}
                    </Text>
                    {r.note ? <Text style={[styles.requestNote, { color: textSecondary }]}>{r.note}</Text> : null}
                    <View style={styles.decideRow}>
                      <Pressable
                        style={[styles.approveBtn]}
                        onPress={() => void decideRequest(r.id, true, name)}
                        disabled={busy}
                      >
                        <Text style={styles.approveBtnText}>Approve</Text>
                      </Pressable>
                      <Pressable
                        style={styles.declineBtn}
                        onPress={() => void decideRequest(r.id, false, name)}
                        disabled={busy}
                      >
                        <Text style={styles.declineBtnText}>Decline</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 48 },
  header: { marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  subtitle: { fontSize: 13, marginTop: 2 },
  balanceRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  balanceCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
  },
  balanceNum: { fontSize: 22, fontWeight: '700' },
  balanceLabel: { fontSize: 10, marginTop: 2, textAlign: 'center', fontWeight: '500' },
  toilBanner: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    marginBottom: 12,
  },
  toilText: { fontSize: 13 },
  segmentRow: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
    gap: 3,
  },
  segment: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  segmentLabel: { fontSize: 13 },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 16,
  },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 15, fontWeight: '600', marginBottom: 14 },
  fieldLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  dateBtn: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  dateBtnText: { fontSize: 14 },
  dayPreview: { fontSize: 13, fontWeight: '600', marginBottom: 12 },
  textArea: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    fontSize: 14,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  sectionHeading: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  emptyCard: { borderRadius: 12, borderWidth: 1, padding: 20, alignItems: 'center', marginBottom: 16 },
  emptyText: { fontSize: 14 },
  requestCard: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10 },
  requestRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  requestKind: { fontSize: 14, fontWeight: '600', flex: 1 },
  requestStatus: { fontSize: 12, fontWeight: '500' },
  requestDates: { fontSize: 13, marginBottom: 4 },
  requestNote: { fontSize: 13, fontStyle: 'italic', marginBottom: 6 },
  cancelBtn: { alignSelf: 'flex-start', marginTop: 6 },
  cancelBtnText: { fontSize: 13, color: '#b91c1c', fontWeight: '500' },
  decideRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  approveBtn: { flex: 1, backgroundColor: '#008B60', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  approveBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  declineBtn: { flex: 1, borderWidth: 1, borderColor: '#fca5a5', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  declineBtnText: { color: '#b91c1c', fontSize: 13, fontWeight: '600' },
});
