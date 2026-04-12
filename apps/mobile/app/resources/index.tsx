import { Card, EmptyState, Input, useCampsiteTheme } from '@campsite/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { PermissionKey } from '@campsite/types';

import { TabSafeScreen } from '@/components/shell/TabSafeScreen';
import { useAuth } from '@/lib/AuthContext';
import { isMissingArchivedAtColumn } from '@/lib/staffResourceArchiveCompat';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

type ResourceRow = {
  id: string;
  title: string;
  description: string;
  file_name: string;
  mime_type: string;
  byte_size: number;
  updated_at: string;
  folder_id: string | null;
  staff_resource_folders?: { id: string; name: string } | null;
};

type FolderRow = { id: string; name: string; sort_order: number };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseFolderParam(raw: string | undefined): string | null | 'none' {
  if (raw === undefined || raw === '') return null;
  if (raw === 'none') return 'none';
  if (UUID_RE.test(raw)) return raw;
  return null;
}

function normalizeFolderEmbed(
  v: unknown,
): { id: string; name: string } | null | undefined {
  if (v == null) return null;
  if (Array.isArray(v)) {
    const first = v[0] as { id?: unknown; name?: unknown } | undefined;
    if (!first?.id) return null;
    return { id: String(first.id), name: String(first.name ?? '') };
  }
  const o = v as { id?: unknown; name?: unknown };
  if (!o.id) return null;
  return { id: String(o.id), name: String(o.name ?? '') };
}

function normalizeResourceRow(r: Record<string, unknown>): ResourceRow {
  return {
    id: String(r.id ?? ''),
    title: String(r.title ?? ''),
    description: r.description != null ? String(r.description) : '',
    file_name: String(r.file_name ?? ''),
    mime_type: String(r.mime_type ?? ''),
    byte_size: Number(r.byte_size ?? 0),
    updated_at: String(r.updated_at ?? ''),
    folder_id: r.folder_id != null ? String(r.folder_id) : null,
    staff_resource_folders: normalizeFolderEmbed(r.staff_resource_folders) ?? null,
  };
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ResourcesIndexScreen() {
  const { tokens, scheme } = useCampsiteTheme();
  const router = useRouter();
  const { folder: folderParam, archived: archivedParam } = useLocalSearchParams<{
    folder?: string;
    archived?: string;
  }>();
  const folderFilter = parseFolderParam(
    typeof folderParam === 'string' ? folderParam : folderParam?.[0],
  );
  const archivedRaw =
    typeof archivedParam === 'string' ? archivedParam : Array.isArray(archivedParam) ? archivedParam[0] : undefined;
  const wantsArchived = archivedRaw === '1' || archivedRaw === 'true';
  const { profile, configured } = useAuth();
  const orgId = profile?.org_id ?? null;
  const [q, setQ] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [archiveColumnOk, setArchiveColumnOk] = useState(true);
  useEffect(() => {
    const delay = q.trim().length >= 2 ? 300 : 0;
    const t = setTimeout(() => setDebouncedSearch(q.trim()), delay);
    return () => clearTimeout(t);
  }, [q]);

  const debounced = debouncedSearch.length >= 2 ? debouncedSearch : '';

  const permissionsQuery = useQuery({
    queryKey: ['my-permissions', orgId],
    enabled: configured && isSupabaseConfigured() && !!orgId && profile?.status === 'active',
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('get_my_permissions', { p_org_id: orgId! });
      if (error) throw error;
      const rows = (data ?? []) as { permission_key?: string }[];
      return rows.map((r) => String(r.permission_key ?? '')) as PermissionKey[];
    },
    staleTime: 60_000,
  });

  const canManageResources = Boolean(permissionsQuery.data?.includes('resources.manage'));
  const archiveOnly = canManageResources && wantsArchived && archiveColumnOk;

  const buildResourcesPath = (opts: { folder?: string | null | 'none'; archived?: boolean }) => {
    const qs: string[] = [];
    if (opts.archived) qs.push('archived=1');
    if (opts.folder === 'none') qs.push('folder=none');
    else if (opts.folder) qs.push(`folder=${opts.folder}`);
    return qs.length ? `/resources?${qs.join('&')}` : '/resources';
  };

  const foldersQuery = useQuery({
    queryKey: ['mobile-staff-resource-folders', orgId],
    enabled: configured && isSupabaseConfigured() && !!orgId && profile?.status === 'active',
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('staff_resource_folders')
        .select('id, name, sort_order')
        .eq('org_id', orgId!)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as FolderRow[];
    },
    staleTime: 30_000,
  });

  const listQuery = useQuery({
    queryKey: ['mobile-staff-resources', orgId, debounced, folderFilter, archiveOnly, archiveColumnOk],
    enabled:
      configured &&
      isSupabaseConfigured() &&
      !!orgId &&
      profile?.status === 'active' &&
      permissionsQuery.isFetched,
    queryFn: async () => {
      const supabase = getSupabase();
      const wantsArchiveList = canManageResources && wantsArchived;

      if (wantsArchiveList && archiveColumnOk) {
        let q = supabase
          .from('staff_resources')
          .select(
            'id, title, description, file_name, mime_type, byte_size, updated_at, folder_id, staff_resource_folders(id, name)',
          )
          .eq('org_id', orgId!)
          .not('archived_at', 'is', null)
          .order('updated_at', { ascending: false })
          .limit(200);
        if (folderFilter === 'none') q = q.is('folder_id', null);
        else if (folderFilter) q = q.eq('folder_id', folderFilter);
        const { data, error } = await q;
        if (error && isMissingArchivedAtColumn(error)) {
          setArchiveColumnOk(false);
          return [];
        }
        if (error) throw error;
        const raw = (data ?? []) as Record<string, unknown>[];
        return raw.map((r) => normalizeResourceRow(r));
      }
      if (debounced) {
        const { data, error } = await supabase.rpc('search_staff_resources', {
          q: debounced,
          limit_n: 80,
        });
        if (error) throw error;
        let list = ((data ?? []) as Record<string, unknown>[]).map((row) => normalizeResourceRow(row));
        if (folderFilter === 'none') list = list.filter((r) => !r.folder_id);
        else if (folderFilter) list = list.filter((r) => r.folder_id === folderFilter);
        return list;
      }
      let q = supabase
        .from('staff_resources')
        .select(
          'id, title, description, file_name, mime_type, byte_size, updated_at, folder_id, staff_resource_folders(id, name)',
        )
        .eq('org_id', orgId!)
        .is('archived_at', null)
        .order('updated_at', { ascending: false })
        .limit(200);
      if (folderFilter === 'none') q = q.is('folder_id', null);
      else if (folderFilter) q = q.eq('folder_id', folderFilter);
      let { data, error } = await q;
      if (error && isMissingArchivedAtColumn(error)) {
        setArchiveColumnOk(false);
        let q2 = supabase
          .from('staff_resources')
          .select(
            'id, title, description, file_name, mime_type, byte_size, updated_at, folder_id, staff_resource_folders(id, name)',
          )
          .eq('org_id', orgId!)
          .order('updated_at', { ascending: false })
          .limit(200);
        if (folderFilter === 'none') q2 = q2.is('folder_id', null);
        else if (folderFilter) q2 = q2.eq('folder_id', folderFilter);
        const second = await q2;
        data = second.data;
        error = second.error;
      }
      if (error) throw error;
      const raw = (data ?? []) as Record<string, unknown>[];
      return raw.map((r) => normalizeResourceRow(r));
    },
    staleTime: 30_000,
  });

  const folders = foldersQuery.data ?? [];
  const rows = listQuery.data ?? [];

  const grouped = useMemo(() => {
    if (debounced || folderFilter !== null) return null;
    const uncategorized = rows.filter((r) => !r.folder_id);
    const sections: { title: string; data: ResourceRow[] }[] = [];
    if (uncategorized.length > 0) {
      sections.push({ title: 'Uncategorised', data: uncategorized });
    }
    for (const f of folders) {
      const data = rows.filter((r) => r.folder_id === f.id);
      if (data.length > 0) sections.push({ title: f.name, data });
    }
    return sections.length > 0 ? sections : null;
  }, [rows, folders, debounced, folderFilter]);

  const currentFolderLabel =
    folderFilter && folderFilter !== 'none'
      ? folders.find((f) => f.id === folderFilter)?.name ?? 'Folder'
      : folderFilter === 'none'
        ? 'Uncategorised'
        : null;

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

  const searchActive = debounced.length >= 2;

  const chip = (label: string, active: boolean, href: string) => (
    <Pressable
      onPress={() => router.push(href as `/resources${string}`)}
      style={[
        styles.chip,
        {
          borderColor: active ? tokens.textPrimary : tokens.border,
          backgroundColor: active ? tokens.textPrimary : cardBg,
        },
      ]}
    >
      <Text
        style={{
          fontSize: 12.5,
          fontWeight: '600',
          color: active ? (scheme === 'dark' ? tokens.background : '#faf9f6') : tokens.textPrimary,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );

  return (
    <TabSafeScreen>
      <View style={styles.pad}>
        <Text style={[styles.h1, { color: tokens.textPrimary }]}>
          Resource library
          {archiveOnly ? (
            <Text style={{ fontSize: 18, fontWeight: '400', color: tokens.textSecondary }}> · Archived</Text>
          ) : null}
        </Text>
        <Text style={[styles.sub, { color: tokens.textSecondary }]}>
          {archiveOnly
            ? 'Hidden from the main list. Open a file to restore or delete it.'
            : 'Policies and reference files for your organisation.'}
        </Text>

        {canManageResources && archiveColumnOk ? (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Pressable
              onPress={() => router.push(archiveOnly ? '/resources' : '/resources?archived=1')}
              style={({ pressed }) => ({
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 10,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: tokens.border,
                opacity: pressed ? 0.88 : 1,
              })}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: tokens.textPrimary }}>
                {archiveOnly ? 'Active library' : 'Archived'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
          <View style={{ flexDirection: 'row', gap: 8, paddingRight: 16 }}>
            {chip(
              'All',
              folderFilter === null && !searchActive,
              buildResourcesPath({ archived: archiveOnly }),
            )}
            {chip(
              'Uncategorised',
              folderFilter === 'none' && !searchActive,
              buildResourcesPath({ archived: archiveOnly, folder: 'none' }),
            )}
            {folders.map((f) =>
              chip(
                f.name,
                folderFilter === f.id && !searchActive,
                buildResourcesPath({ archived: archiveOnly, folder: f.id }),
              ),
            )}
          </View>
        </ScrollView>

        {currentFolderLabel && !searchActive ? (
          <Text style={{ marginTop: 10, fontSize: 13, color: tokens.textSecondary }}>
            Viewing: <Text style={{ fontWeight: '600', color: tokens.textPrimary }}>{currentFolderLabel}</Text>
          </Text>
        ) : null}

        {archiveOnly ? (
          <Text style={{ marginTop: 12, fontSize: 12, color: tokens.textMuted }}>
            Search applies to the active library only. Switch to Active library to search.
          </Text>
        ) : (
          <Input
            value={q}
            onChangeText={setQ}
            placeholder="Search (2+ characters)…"
            style={{ marginTop: 12 }}
          />
        )}
        {listQuery.isLoading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={tokens.textPrimary} />
        ) : listQuery.error ? (
          <Card style={{ marginTop: 16 }}>
            <Text style={{ color: tokens.warning }}>
              {listQuery.error instanceof Error ? listQuery.error.message : 'Could not load'}
            </Text>
          </Card>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No resources"
            description={
              debounced
                ? 'Try another search.'
                : archiveOnly
                  ? 'No archived files.'
                  : 'Nothing uploaded yet.'
            }
          />
        ) : grouped && grouped.length > 0 ? (
          <SectionList
            style={{ marginTop: 12 }}
            sections={grouped}
            keyExtractor={(item) => item.id}
            renderSectionHeader={({ section: { title } }) => (
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  letterSpacing: 0.6,
                  color: tokens.textMuted,
                  marginBottom: 8,
                  marginTop: 4,
                }}
              >
                {title.toUpperCase()}
              </Text>
            )}
            renderItem={({ item }) => (
              <ResourceCard
                item={item}
                cardBg={cardBg}
                tokens={tokens}
                onPress={() => router.push(`/resources/${item.id}`)}
              />
            )}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            stickySectionHeadersEnabled={false}
          />
        ) : (
          <FlatList
            style={{ marginTop: 12 }}
            data={rows}
            keyExtractor={(item) => item.id}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            renderItem={({ item }) => (
              <ResourceCard
                item={item}
                cardBg={cardBg}
                tokens={tokens}
                onPress={() => router.push(`/resources/${item.id}`)}
              />
            )}
          />
        )}
      </View>
    </TabSafeScreen>
  );
}

function ResourceCard({
  item,
  cardBg,
  tokens,
  onPress,
}: {
  item: ResourceRow;
  cardBg: string;
  tokens: { border: string; textPrimary: string; textSecondary: string; textMuted: string };
  onPress: () => void;
}) {
  const folderName = item.staff_resource_folders?.name;
  return (
    <Pressable
      onPress={onPress}
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
        {folderName ? `${folderName} · ` : null}
        {item.file_name} · {formatBytes(item.byte_size)}
        {item.updated_at ? ` · ${new Date(item.updated_at).toLocaleString()}` : ''}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pad: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  h1: { fontSize: 22, fontWeight: '700' },
  sub: { fontSize: 13, marginTop: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 200,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
  },
  title: { fontSize: 16, fontWeight: '600' },
  desc: { fontSize: 13, marginTop: 4 },
  meta: { fontSize: 11, marginTop: 6 },
});
