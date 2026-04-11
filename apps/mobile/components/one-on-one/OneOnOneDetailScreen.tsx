import { useCampsiteTheme } from '@campsite/ui';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { ProfileRow } from '@/lib/AuthContext';
import { getSupabase } from '@/lib/supabase';

type MeetingDetail = {
  id: string;
  manager_user_id: string;
  report_user_id: string;
  manager_name: string | null;
  report_name: string | null;
  starts_at: string;
  status: string;
  shared_notes: string;
  notes_locked_at: string | null;
  completed_at: string | null;
};

export function OneOnOneDetailScreen({ profile, meetingId }: { profile: ProfileRow; meetingId: string }) {
  const { tokens, scheme } = useCampsiteTheme();
  const isDark = scheme === 'dark';
  const router = useRouter();
  const supabase = useMemo(() => getSupabase(), []);
  const [m, setM] = useState<MeetingDetail | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [proposed, setProposed] = useState('');

  const textPrimary = isDark ? tokens.textPrimary : '#121212';
  const textSecondary = isDark ? tokens.textSecondary : '#6b6b6b';
  const border = isDark ? tokens.border : '#d8d8d8';

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('one_on_one_meeting_get', { p_meeting_id: meetingId });
    setLoading(false);
    if (error || !data || typeof data !== 'object') {
      setErr(error?.message ?? 'Not found');
      return;
    }
    const row = data as unknown as MeetingDetail;
    setM(row);
    setNotes(row.shared_notes ?? '');
  }, [supabase, meetingId]);

  useEffect(() => {
    void load();
  }, [load]);

  const isManager = m?.manager_user_id === profile.id;
  const locked = Boolean(m?.notes_locked_at) || m?.status === 'completed';
  const canEditNotes = m && !locked && m.status !== 'cancelled';

  const saveNotes = async () => {
    if (!m) return;
    setErr(null);
    const { error } = await supabase.rpc('one_on_one_meeting_update_notes', {
      p_meeting_id: m.id,
      p_notes: notes,
    });
    if (error) setErr(error.message);
  };

  const setStatus = async (status: string) => {
    if (!m) return;
    setErr(null);
    const { error } = await supabase.rpc('one_on_one_meeting_set_status', {
      p_meeting_id: m.id,
      p_status: status,
    });
    if (error) setErr(error.message);
    else void load();
  };

  const submitEditRequest = async () => {
    if (!m) return;
    setErr(null);
    const { error } = await supabase.rpc('one_on_one_note_edit_request_create', {
      p_meeting_id: m.id,
      p_proposed_notes: proposed,
    });
    if (error) setErr(error.message);
    else setProposed('');
  };

  if (loading || !m) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        {err ? <Text style={{ color: '#b91c1c', marginTop: 12 }}>{err}</Text> : null}
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Pressable onPress={() => router.back()}>
        <Text style={{ color: textSecondary, fontSize: 13 }}>← Back</Text>
      </Pressable>
      <Text style={[styles.title, { color: textPrimary }]}>{isManager ? m.report_name : m.manager_name}</Text>
      <Text style={[styles.meta, { color: textSecondary }]}>
        {new Date(m.starts_at).toLocaleString()} · {m.status.replace('_', ' ')}
      </Text>

      {err ? <Text style={styles.err}>{err}</Text> : null}

      <Text style={[styles.h2, { color: textPrimary }]}>Shared notes</Text>
      {canEditNotes ? (
        <>
          <TextInput
            multiline
            value={notes}
            onChangeText={setNotes}
            style={[styles.input, { color: textPrimary, borderColor: border }]}
          />
          <Pressable onPress={() => void saveNotes()} style={styles.btnDark}>
            <Text style={styles.btnDarkText}>Save</Text>
          </Pressable>
        </>
      ) : (
        <Text style={[styles.body, { color: textPrimary }]}>{m.shared_notes || '—'}</Text>
      )}

      {isManager && m.status !== 'completed' && m.status !== 'cancelled' ? (
        <View style={{ marginTop: 16, gap: 8 }}>
          {m.status === 'scheduled' ? (
            <Pressable onPress={() => void setStatus('in_progress')} style={styles.btnOutline}>
              <Text style={{ color: textPrimary }}>Start meeting</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => void setStatus('completed')} style={styles.btnDark}>
            <Text style={styles.btnDarkText}>Mark complete</Text>
          </Pressable>
        </View>
      ) : null}

      {locked && (m.manager_user_id === profile.id || m.report_user_id === profile.id) ? (
        <View style={{ marginTop: 20 }}>
          <Text style={[styles.h2, { color: textPrimary }]}>Request note change</Text>
          <TextInput
            multiline
            value={proposed}
            onChangeText={setProposed}
            placeholder="Proposed notes"
            placeholderTextColor={textSecondary}
            style={[styles.input, { color: textPrimary, borderColor: border }]}
          />
          <Pressable onPress={() => void submitEditRequest()} style={styles.btnDark}>
            <Text style={styles.btnDarkText}>Submit request</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 22, fontWeight: '600', marginTop: 12 },
  meta: { fontSize: 13, marginTop: 6 },
  h2: { fontSize: 15, fontWeight: '600', marginTop: 20, marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 20 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 12,
    minHeight: 120,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  btnDark: {
    alignSelf: 'flex-start',
    backgroundColor: '#121212',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 10,
  },
  btnDarkText: { color: '#faf9f6', fontWeight: '600', fontSize: 14 },
  btnOutline: {
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d8d8d8',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  err: { color: '#b91c1c', marginTop: 12, fontSize: 13 },
});
