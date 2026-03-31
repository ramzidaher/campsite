import { isApproverRole, rolesAssignableOnApprove, type ProfileRole } from '@campsite/types';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
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

import { AppMobileHeader } from '@/components/shell/AppMobileHeader';
import { mainShell } from '@/constants/mainShell';
import { useAuth } from '@/lib/AuthContext';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

type PendingRow = {
  id: string;
  full_name: string;
  email: string | null;
  created_at: string;
  departments: string[];
};

async function fetchPendingRows(userId: string, orgId: string, role: string): Promise<PendingRow[]> {
  const supabase = getSupabase();
  const { data: pending } = await supabase
    .from('profiles')
    .select('id,full_name,email,created_at')
    .eq('org_id', orgId)
    .eq('status', 'pending');

  let list = pending ?? [];

  if (role === 'manager') {
    const { data: managed } = await supabase.from('dept_managers').select('dept_id').eq('user_id', userId);
    const deptIds = (managed ?? []).map((m) => m.dept_id as string);
    if (!deptIds.length) {
      list = [];
    } else {
      const { data: ud } = await supabase.from('user_departments').select('user_id').in('dept_id', deptIds);
      const allowed = new Set((ud ?? []).map((u) => u.user_id as string));
      list = list.filter((p) => allowed.has(p.id));
    }
  } else if (role === 'coordinator') {
    const { data: ud } = await supabase.from('user_departments').select('dept_id').eq('user_id', userId);
    const deptIds = [...new Set((ud ?? []).map((u) => u.dept_id as string))];
    if (!deptIds.length) {
      list = [];
    } else {
      const { data: ud2 } = await supabase.from('user_departments').select('user_id').in('dept_id', deptIds);
      const allowed = new Set((ud2 ?? []).map((u) => u.user_id as string));
      list = list.filter((p) => allowed.has(p.id));
    }
  }

  const ids = list.map((p) => p.id);
  const deptNames: Record<string, string[]> = {};
  if (ids.length) {
    const { data: ud } = await supabase
      .from('user_departments')
      .select('user_id, departments(name)')
      .in('user_id', ids);
    for (const row of ud ?? []) {
      const uid = row.user_id as string;
      const d = row.departments as { name: string } | { name: string }[] | null;
      if (!deptNames[uid]) deptNames[uid] = [];
      if (Array.isArray(d)) {
        d.forEach((x) => {
          if (x?.name) deptNames[uid].push(x.name);
        });
      } else if (d && 'name' in d && d.name) {
        deptNames[uid].push(d.name);
      }
    }
  }

  return list.map((p) => ({
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    created_at: p.created_at,
    departments: deptNames[p.id] ?? [],
  }));
}

export default function PendingApprovalsScreen() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [approveRole, setApproveRole] = useState<ProfileRole>('csa');

  const load = useCallback(async () => {
    if (!isSupabaseConfigured() || !user?.id || !profile?.org_id || !isApproverRole(profile.role)) {
      setRows([]);
      return;
    }
    const data = await fetchPendingRows(user.id, profile.org_id, profile.role);
    setRows(data);
  }, [user?.id, profile?.org_id, profile?.role]);

  const assignableRoles = rolesAssignableOnApprove(profile?.role);
  const roleLabel = (r: string) => r.replace(/_/g, ' ');

  useFocusEffect(
    useCallback(() => {
      if (authLoading) return undefined;
      if (!profile || !isApproverRole(profile.role)) {
        router.replace('/(tabs)');
        return undefined;
      }
      let cancelled = false;
      void (async () => {
        setLoading(true);
        try {
          await load();
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [authLoading, profile, load, router])
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  async function approve(id: string) {
    if (!isSupabaseConfigured()) return;
    setBusyId(id);
    try {
      const supabase = getSupabase();
      const { data: me } = await supabase.auth.getUser();
      if (!me.user) return;
      const { error } = await supabase.rpc('approve_pending_profile', {
        p_target: id,
        p_approve: true,
        p_rejection_note: null,
        p_role: approveRole,
      });
      if (error) {
        Alert.alert('Could not approve', error.message);
        return;
      }
      setRows((r) => r.filter((x) => x.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    if (!isSupabaseConfigured()) return;
    setBusyId(id);
    try {
      const supabase = getSupabase();
      const { data: me } = await supabase.auth.getUser();
      if (!me.user) return;
      const { error } = await supabase.rpc('approve_pending_profile', {
        p_target: id,
        p_approve: false,
        p_rejection_note: notes[id]?.trim() ? notes[id]!.trim() : null,
        p_role: null,
      });
      if (error) {
        Alert.alert('Could not reject', error.message);
        return;
      }
      setRows((r) => r.filter((x) => x.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  if (!isSupabaseConfigured()) {
    return (
      <View style={styles.root}>
        <AppMobileHeader />
        <View style={[styles.screen, { backgroundColor: mainShell.pageBg }]}>
          <Text style={styles.muted}>Supabase is not configured for this build.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <AppMobileHeader />
      <ScrollView
        style={[styles.screen, { backgroundColor: mainShell.pageBg }]}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
      >
        <Text style={styles.title}>Pending members</Text>
        <Text style={styles.sub}>Approve or reject new registrations in your organisation.</Text>
        <Text style={styles.rolePickLabel}>Role when approving</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roleChips}>
          {assignableRoles.map((r) => (
            <Pressable
              key={r}
              onPress={() => setApproveRole(r)}
              style={[styles.roleChip, approveRole === r && styles.roleChipOn]}
            >
              <Text style={[styles.roleChipText, approveRole === r && styles.roleChipTextOn]}>
                {roleLabel(r)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {loading ? (
          <ActivityIndicator style={styles.spinner} color="#1D4ED8" />
        ) : rows.length === 0 ? (
          <Text style={styles.muted}>No pending registrations.</Text>
        ) : (
          rows.map((p) => (
            <View key={p.id} style={styles.card}>
              <Text style={styles.name}>{p.full_name}</Text>
              <Text style={styles.meta}>{p.email ?? '-'}</Text>
              <Text style={styles.small}>Requested {new Date(p.created_at).toLocaleString()}</Text>
              <Text style={styles.deptLine}>
                Departments: {p.departments.length ? p.departments.join(', ') : '-'}
              </Text>
              <Text style={styles.noteLabel}>Rejection note (optional)</Text>
              <TextInput
                style={styles.input}
                value={notes[p.id] ?? ''}
                onChangeText={(t) => setNotes((n) => ({ ...n, [p.id]: t }))}
                placeholder="Reason if rejecting"
                placeholderTextColor={mainShell.textMuted}
              />
              <View style={styles.actions}>
                <Pressable
                  style={[styles.btn, styles.btnApprove, busyId === p.id && styles.btnDisabled]}
                  disabled={busyId === p.id}
                  onPress={() => void approve(p.id)}
                >
                  <Text style={styles.btnApproveText}>Approve</Text>
                </Pressable>
                <Pressable
                  style={[styles.btn, styles.btnReject, busyId === p.id && styles.btnDisabled]}
                  disabled={busyId === p.id}
                  onPress={() => void reject(p.id)}
                >
                  <Text style={styles.btnRejectText}>Reject</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  screen: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: '600', color: mainShell.pageText },
  sub: { marginTop: 6, fontSize: 14, lineHeight: 21, color: mainShell.textSecondary },
  rolePickLabel: { marginTop: 14, fontSize: 12, fontWeight: '600', color: mainShell.textMuted },
  roleChips: { marginTop: 8, flexGrow: 0 },
  roleChip: {
    marginRight: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: mainShell.border,
    backgroundColor: mainShell.surface,
  },
  roleChipOn: { borderColor: '#15803D', backgroundColor: '#dcfce7' },
  roleChipText: { fontSize: 13, color: mainShell.textSecondary, textTransform: 'capitalize' },
  roleChipTextOn: { color: '#166534', fontWeight: '600' },
  muted: { marginTop: 24, fontSize: 14, color: mainShell.textSecondary },
  spinner: { marginTop: 32 },
  card: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: mainShell.border,
    backgroundColor: mainShell.surface,
  },
  name: { fontSize: 16, fontWeight: '600', color: mainShell.pageText },
  meta: { marginTop: 4, fontSize: 14, color: mainShell.textSecondary },
  small: { marginTop: 6, fontSize: 12, color: mainShell.textMuted },
  deptLine: { marginTop: 8, fontSize: 14, color: mainShell.textSecondary },
  noteLabel: { marginTop: 12, fontSize: 12, color: mainShell.textMuted },
  input: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: mainShell.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: mainShell.pageText,
    backgroundColor: mainShell.pageBg,
  },
  actions: { marginTop: 12, flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnApprove: { backgroundColor: '#15803D' },
  btnReject: { backgroundColor: '#d97706' },
  btnDisabled: { opacity: 0.5 },
  btnApproveText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  btnRejectText: { fontSize: 14, fontWeight: '600', color: '#fff' },
});
