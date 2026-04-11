import { Card, useCampsiteTheme } from '@campsite/ui';
import Constants from 'expo-constants';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { TabSafeScreen } from '@/components/shell/TabSafeScreen';
import { useAuth } from '@/lib/AuthContext';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export default function ResourceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { tokens, scheme } = useCampsiteTheme();
  const { profile, session, configured } = useAuth();
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryNote, setSummaryNote] = useState<string | null>(null);
  const [summaryErr, setSummaryErr] = useState<string | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(true);

  const siteUrl = useMemo(() => {
    const raw = (Constants.expoConfig?.extra as { siteUrl?: string } | undefined)?.siteUrl?.trim() ?? '';
    return raw.replace(/\/$/, '');
  }, []);

  const detailQuery = useQuery({
    queryKey: ['mobile-staff-resource', id],
    enabled: configured && isSupabaseConfigured() && !!id && profile?.status === 'active',
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('staff_resources')
        .select('id, title, description, file_name, mime_type, byte_size, storage_path, updated_at')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Not found');
      return data as {
        id: string;
        title: string;
        description: string;
        file_name: string;
        mime_type: string;
        byte_size: number;
        storage_path: string;
        updated_at: string;
      };
    },
    staleTime: 30_000,
  });

  const storagePath = detailQuery.data?.storage_path;

  const signedUrlQuery = useQuery({
    queryKey: ['mobile-staff-resource-signed', storagePath],
    enabled: !!storagePath && configured && isSupabaseConfigured(),
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase.storage
        .from('staff-resources')
        .createSignedUrl(storagePath!, 3600);
      if (error) throw error;
      return data?.signedUrl ?? null;
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!detailQuery.data || !siteUrl || !session?.access_token) {
      setSummaryBusy(false);
      return;
    }
    let cancelled = false;
    setSummaryBusy(true);
    setSummaryErr(null);
    setSummary(null);
    setSummaryNote(null);
    void (async () => {
      try {
        const res = await fetch(`${siteUrl}/api/resources/summarize`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ resourceId: detailQuery.data!.id }),
        });
        let data: { summary?: string; note?: string; error?: string; message?: string } = {};
        try {
          data = (await res.json()) as typeof data;
        } catch {
          /* ignore */
        }
        if (cancelled) return;
        if (!res.ok) {
          const msg =
            data.error === 'not_configured' && typeof data.message === 'string'
              ? data.message
              : typeof data.error === 'string'
                ? data.error
                : 'Could not summarise.';
          setSummaryErr(msg);
          return;
        }
        if (typeof data.summary === 'string' && data.summary.trim()) {
          setSummary(data.summary.trim());
        } else {
          setSummaryErr('No summary returned.');
        }
        if (typeof data.note === 'string' && data.note.trim()) {
          setSummaryNote(data.note.trim());
        }
      } catch {
        if (!cancelled) setSummaryErr('Network error.');
      } finally {
        if (!cancelled) setSummaryBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detailQuery.data, siteUrl, session?.access_token]);

  const cardBg = scheme === 'dark' ? tokens.surface : '#ffffff';

  if (!configured || !isSupabaseConfigured()) {
    return (
      <TabSafeScreen>
        <View style={styles.pad}>
          <Text style={{ color: tokens.textSecondary }}>Connect Supabase to open resources.</Text>
        </View>
      </TabSafeScreen>
    );
  }

  if (detailQuery.isLoading) {
    return (
      <TabSafeScreen>
        <ActivityIndicator style={{ marginTop: 24 }} color={tokens.textPrimary} />
      </TabSafeScreen>
    );
  }

  if (detailQuery.error || !detailQuery.data) {
    return (
      <TabSafeScreen>
        <View style={styles.pad}>
          <Text style={{ color: tokens.textSecondary }}>Could not load this resource.</Text>
          <Pressable onPress={() => router.back()} style={{ marginTop: 12 }}>
            <Text style={{ color: tokens.accent, fontWeight: '600' }}>Go back</Text>
          </Pressable>
        </View>
      </TabSafeScreen>
    );
  }

  const row = detailQuery.data;

  return (
    <TabSafeScreen>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.pad, { paddingBottom: 32 }]}>
        <Pressable onPress={() => router.push('/resources')}>
          <Text style={{ color: tokens.textSecondary, fontSize: 13 }}>← Resource library</Text>
        </Pressable>
        <Text style={[styles.h1, { color: tokens.textPrimary, marginTop: 12 }]}>{row.title}</Text>
        {row.description ? (
          <Text style={[styles.body, { color: tokens.textSecondary, marginTop: 8 }]}>{row.description}</Text>
        ) : null}

        {signedUrlQuery.data ? (
          <Pressable
            onPress={() => void Linking.openURL(signedUrlQuery.data!)}
            style={({ pressed }) => [
              styles.btn,
              { backgroundColor: tokens.textPrimary, opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <Text style={{ color: scheme === 'dark' ? tokens.background : '#faf9f6', fontWeight: '600' }}>
              Open / download
            </Text>
          </Pressable>
        ) : (
          <Text style={{ color: tokens.textMuted, marginTop: 12 }}>
            {signedUrlQuery.error ? 'Could not prepare download.' : 'Preparing download…'}
          </Text>
        )}

        <Text style={[styles.meta, { color: tokens.textMuted, marginTop: 8 }]}>
          {row.file_name} · {row.byte_size} bytes · {new Date(row.updated_at).toLocaleString()}
        </Text>

        <Card style={{ marginTop: 20, backgroundColor: cardBg, borderColor: tokens.border }}>
          <Text style={[styles.aiKicker, { color: tokens.textMuted }]}>AI SUMMARY</Text>
          {summaryBusy ? (
            <Text style={{ color: tokens.textSecondary, marginTop: 8 }}>Generating summary…</Text>
          ) : summaryErr ? (
            <Text style={{ color: tokens.warning, marginTop: 8 }}>{summaryErr}</Text>
          ) : summary ? (
            <Text style={{ color: tokens.textPrimary, marginTop: 8, lineHeight: 22 }}>{summary}</Text>
          ) : (
            <Text style={{ color: tokens.textSecondary, marginTop: 8 }}>No summary.</Text>
          )}
          {summaryNote ? (
            <Text style={{ color: tokens.textMuted, marginTop: 8, fontSize: 12 }}>{summaryNote}</Text>
          ) : null}
        </Card>
      </ScrollView>
    </TabSafeScreen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16, paddingTop: 8 },
  h1: { fontSize: 22, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22 },
  meta: { fontSize: 12 },
  btn: {
    marginTop: 16,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  aiKicker: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
});
