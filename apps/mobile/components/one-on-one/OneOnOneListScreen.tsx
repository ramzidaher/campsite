import { useCampsiteTheme } from '@campsite/ui';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { ProfileRow } from '@/lib/AuthContext';
import { mainShell, mainShellText } from '@/constants/mainShell';
import { getSupabase } from '@/lib/supabase';

type MeetingRow = {
  id: string;
  manager_user_id: string;
  report_user_id: string;
  manager_name: string | null;
  report_name: string | null;
  starts_at: string;
  status: string;
  notes_preview: string | null;
};

export function OneOnOneListScreen({ profile }: { profile: ProfileRow }) {
  const { tokens, scheme } = useCampsiteTheme();
  const isDark = scheme === 'dark';
  const router = useRouter();
  const supabase = useMemo(() => getSupabase(), []);
  const [rows, setRows] = useState<MeetingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const textPrimary = isDark ? tokens.textPrimary : '#121212';
  const textSecondary = isDark ? tokens.textSecondary : '#6b6b6b';
  const border = isDark ? tokens.border : '#e8e8e8';
  const cardBg = isDark ? tokens.surface : '#ffffff';

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('one_on_one_meeting_list', {
      p_limit: 60,
      p_include_cancelled: false,
    });
    if (error) {
      setRows([]);
      setLoading(false);
      return;
    }
    const list = Array.isArray(data) ? (data as MeetingRow[]) : [];
    setRows(list);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const titleFor = (m: MeetingRow) =>
    m.manager_user_id === profile.id ? m.report_name ?? '1:1' : m.manager_name ?? '1:1';

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingHorizontal: mainShell.spacing.md,
        paddingTop: mainShell.spacing.md,
        paddingBottom: mainShell.spacing.xxl,
      }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={[styles.heading, { color: textPrimary }]}>1:1 check-ins</Text>
      <Text style={[styles.sub, { color: textSecondary }]}>Tap a meeting to open notes and actions.</Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: mainShell.spacing.xl }} />
      ) : rows.length === 0 ? (
        <Text style={[styles.empty, { color: textSecondary }]}>No 1:1 meetings yet.</Text>
      ) : (
        rows.map((m) => (
          <Pressable
            key={m.id}
            onPress={() => router.push(`/one-on-one/${m.id}`)}
            style={[styles.card, { borderColor: border, backgroundColor: cardBg }]}
          >
            <Text style={[styles.cardTitle, { color: textPrimary }]}>{titleFor(m)}</Text>
            <Text style={[styles.cardMeta, { color: textSecondary }]}>
              {new Date(m.starts_at).toLocaleString(undefined, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              · {m.status.replace('_', ' ')}
            </Text>
            {m.notes_preview ? (
              <Text style={[styles.preview, { color: textSecondary }]} numberOfLines={2}>
                {m.notes_preview}
              </Text>
            ) : null}
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  heading: { ...mainShellText.pageTitle, fontWeight: '600' },
  sub: {
    ...mainShellText.caption,
    marginTop: mainShell.spacing.xs - 2,
    marginBottom: mainShell.spacing.md,
  },
  empty: { ...mainShellText.body, marginTop: mainShell.spacing.sm },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: mainShell.spacing.sm,
    padding: mainShell.spacing.sm + 2,
    marginBottom: mainShell.spacing.xs + 2,
  },
  cardTitle: { ...mainShellText.subheading },
  cardMeta: { ...mainShellText.caption, marginTop: mainShell.spacing.xxs },
  preview: { ...mainShellText.caption, marginTop: mainShell.spacing.xs },
});
