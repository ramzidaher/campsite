import { useCampsiteTheme } from '@campsite/ui';
import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { TabSafeScreen } from '@/components/shell/TabSafeScreen';
import type { ProfileRow } from '@/lib/AuthContext';
import { getSupabase } from '@/lib/supabase';

export function AttendanceScreen({ profile }: { profile: ProfileRow }) {
  const { tokens, scheme } = useCampsiteTheme();
  const isDark = scheme === 'dark';
  const text = isDark ? tokens.textPrimary : '#121212';
  const muted = isDark ? tokens.textMuted : '#6b6b6b';
  const card = isDark ? tokens.surface : '#ffffff';
  const border = isDark ? tokens.border : '#e8e4dc';

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [minutes, setMinutes] = useState<number | null>(null);

  const orgId = profile.org_id as string;

  const refresh = useCallback(async () => {
    if (!orgId) return;
    const supabase = getSupabase();
    const { data: hr } = await supabase
      .from('employee_hr_records')
      .select('timesheet_clock_enabled')
      .eq('org_id', orgId)
      .eq('user_id', profile.id)
      .maybeSingle();
    setEnabled(Boolean(hr?.timesheet_clock_enabled));

    const now = new Date();
    const dow = now.getDay();
    const mon = dow === 0 ? -6 : 1 - dow;
    const ws = new Date(now);
    ws.setDate(ws.getDate() + mon);
    const weekStart = ws.toISOString().slice(0, 10);
    const we = new Date(ws);
    we.setDate(we.getDate() + 6);
    const weekEnd = we.toISOString().slice(0, 10);

    const { data: m } = await supabase.rpc('attendance_week_total_minutes', {
      p_org_id: orgId,
      p_user_id: profile.id,
      p_week_start: weekStart,
      p_week_end: weekEnd,
    });
    setMinutes(typeof m === 'number' ? m : m != null ? Number(m) : null);
  }, [orgId, profile.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function clock(direction: 'in' | 'out') {
    if (!enabled) return;
    setBusy(true);
    setErr(null);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setErr('Location permission is required to clock in.');
      setBusy(false);
      return;
    }
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const supabase = getSupabase();
    const { error } = await supabase.rpc('attendance_clock_event', {
      p_direction: direction,
      p_source: 'self_mobile',
      p_lat: pos.coords.latitude,
      p_lng: pos.coords.longitude,
      p_accuracy_m: pos.coords.accuracy,
      p_target_user_id: null,
      p_manager_reason: null,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    await refresh();
  }

  if (!orgId) {
    return (
      <TabSafeScreen>
        <Text style={{ color: muted }}>No organisation.</Text>
      </TabSafeScreen>
    );
  }

  if (enabled === false) {
    return (
      <TabSafeScreen>
        <Text style={[styles.p, { color: muted }]}>
          Clock in/out is not enabled on your HR record. Ask HR to enable the timesheet clock and set your hourly rate.
        </Text>
      </TabSafeScreen>
    );
  }

  return (
    <TabSafeScreen>
      <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
        <Text style={[styles.title, { color: text }]}>This week</Text>
        <Text style={[styles.stat, { color: text }]}>
          {minutes != null ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : ''}
        </Text>
        {err ? <Text style={styles.err}>{err}</Text> : null}
        <View style={styles.row}>
          <Pressable
            style={[styles.btn, styles.btnPrimary, busy && styles.btnDisabled]}
            disabled={busy || enabled === null}
            onPress={() => void clock('in')}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Clock in</Text>}
          </Pressable>
          <Pressable
            style={[styles.btn, styles.btnGhost, { borderColor: border }, busy && styles.btnDisabled]}
            disabled={busy || enabled === null}
            onPress={() => void clock('out')}
          >
            <Text style={{ color: text, fontWeight: '600' }}>Clock out</Text>
          </Pressable>
        </View>
        <Text style={[styles.hint, { color: muted }]}>Submit your week from the web app when finished.</Text>
      </View>
    </TabSafeScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    margin: 16,
    padding: 20,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    opacity: 0.7,
  },
  stat: {
    fontSize: 28,
    fontWeight: '700',
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  btnPrimary: {
    backgroundColor: '#121212',
  },
  btnPrimaryText: {
    color: '#fff',
    fontWeight: '600',
  },
  btnGhost: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  err: {
    color: '#b91c1c',
    marginTop: 12,
    fontSize: 13,
  },
  hint: {
    marginTop: 16,
    fontSize: 12,
  },
  p: { fontSize: 14, padding: 16 },
});
