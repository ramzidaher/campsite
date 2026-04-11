import { Card, EmptyState, Input, useCampsiteTheme } from '@campsite/ui';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { TabSafeScreen } from '@/components/shell/TabSafeScreen';
import { useAuth } from '@/lib/AuthContext';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export default function ResourcesIndexScreen() {
  const { tokens, scheme } = useCampsiteTheme();
  const router = useRouter();
  const { profile, configured } = useAuth();
  const orgId = profile?.org_id ?? null;
  const [q, setQ] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const delay = q.trim().length >= 2 ? 300 : 0;
    const t = setTimeout(() => setDebouncedSearch(q.trim()), delay);
    return () => clearTimeout(t);
  }, [q]);

  const debounced = debouncedSearch.length >= 2 ? debouncedSearch : '';

  const listQuery = useQuery({
    queryKey: ['mobile-staff-resources', orgId, debounced],
    enabled: configured && isSupabaseConfigured() && !!orgId && profile?.status === 'active',
    queryFn: async () => {
      const supabase = getSupabase();
      if (debounced) {
        const { data, error } = await supabase.rpc('search_staff_resources', {
          q: debounced,
          limit_n: 80,
        });
        if (error) throw error;
        return (data ?? []) as {
          id: string;
          title: string;
          description: string;
          file_name: string;
          updated_at: string;
        }[];
      }
      const { data, error } = await supabase
        .from('staff_resources')
        .select('id, title, description, file_name, updated_at')
        .eq('org_id', orgId!)
        .order('updated_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const cardBg = scheme === 'dark' ? tokens.surface : '#ffffff';

  if (!configured || !isSupabaseConfigured()) {
    return (
      <TabSafeScreen>
        <View style={styles.pad}>
          <Text style={{ color: tokens.textSecondary }}>Connect Supabase to load resources.</Text>
        </View>
      </TabSafeScreen>
    );
  }

  if (!orgId || profile?.status !== 'active') {
    return (
      <TabSafeScreen>
        <EmptyState title="Unavailable" description="Complete registration to see resources." />
      </TabSafeScreen>
    );
  }

  const rows = listQuery.data ?? [];

  return (
    <TabSafeScreen>
      <View style={styles.pad}>
        <Text style={[styles.h1, { color: tokens.textPrimary }]}>Resource library</Text>
        <Text style={[styles.sub, { color: tokens.textSecondary }]}>
          Policies and reference files for your organisation.
        </Text>
        <Input
          value={q}
          onChangeText={setQ}
          placeholder="Search (2+ characters)…"
          style={{ marginTop: 12 }}
        />
        {listQuery.isLoading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={tokens.textPrimary} />
        ) : listQuery.error ? (
          <Card style={{ marginTop: 16 }}>
            <Text style={{ color: tokens.warning }}>
              {listQuery.error instanceof Error ? listQuery.error.message : 'Could not load'}
            </Text>
          </Card>
        ) : rows.length === 0 ? (
          <EmptyState title="No resources" description={debounced ? 'Try another search.' : 'Nothing uploaded yet.'} />
        ) : (
          <FlatList
            style={{ marginTop: 12 }}
            data={rows}
            keyExtractor={(item) => item.id}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => router.push(`/resources/${item.id}`)}
                style={({ pressed }) => [
                  styles.card,
                  {
                    borderColor: tokens.border,
                    backgroundColor: cardBg,
                    opacity: pressed ? 0.94 : 1,
                  },
                ]}
              >
                <Text style={[styles.title, { color: tokens.textPrimary }]} numberOfLines={2}>
                  {item.title}
                </Text>
                {item.description ? (
                  <Text style={[styles.desc, { color: tokens.textSecondary }]} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}
                <Text style={[styles.meta, { color: tokens.textMuted }]}>
                  {item.file_name}
                  {item.updated_at
                    ? ` · ${new Date(item.updated_at).toLocaleString()}`
                    : ''}
                </Text>
              </Pressable>
            )}
          />
        )}
      </View>
    </TabSafeScreen>
  );
}

const styles = StyleSheet.create({
  pad: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  h1: { fontSize: 22, fontWeight: '700' },
  sub: { fontSize: 13, marginTop: 4 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
  },
  title: { fontSize: 16, fontWeight: '600' },
  desc: { fontSize: 13, marginTop: 4 },
  meta: { fontSize: 11, marginTop: 6 },
});
