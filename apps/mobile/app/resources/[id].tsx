import { useCampsiteTheme } from '@campsite/ui';
import { ResizeMode, Video } from 'expo-av';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ResourceDocumentAssistant } from '@/components/resources/ResourceDocumentAssistant';
import { TabSafeScreen } from '@/components/shell/TabSafeScreen';
import { useAuth } from '@/lib/AuthContext';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

const TEXT_PREVIEW_MAX_BYTES = 512_000;

type PreviewKind = 'pdf' | 'image' | 'text' | 'video' | 'audio' | null;

function getPreviewKind(mimeType: string, fileName: string): PreviewKind {
  const m = (mimeType || '').toLowerCase();
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (m === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (
    m.startsWith('text/') ||
    m === 'application/json' ||
    m === 'application/xml' ||
    ext === 'csv' ||
    ext === 'md' ||
    ext === 'txt' ||
    ext === 'log' ||
    ext === 'markdown'
  ) {
    return 'text';
  }
  return null;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ResourceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { tokens, scheme } = useCampsiteTheme();
  const { profile, configured } = useAuth();
  const [textBody, setTextBody] = useState<string | null>(null);
  const [textErr, setTextErr] = useState<string | null>(null);
  const [textBusy, setTextBusy] = useState(false);

  const detailQuery = useQuery({
    queryKey: ['mobile-staff-resource', id],
    enabled: configured && isSupabaseConfigured() && !!id && profile?.status === 'active',
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('staff_resources')
        .select(
          'id, title, description, file_name, mime_type, byte_size, storage_path, updated_at, folder_id, staff_resource_folders(id, name)',
        )
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Not found');
      const raw = data as Record<string, unknown>;
      const folderRaw = raw.staff_resource_folders;
      let folder: { id: string; name: string } | null = null;
      if (folderRaw != null) {
        if (Array.isArray(folderRaw)) {
          const f = folderRaw[0] as { id?: unknown; name?: unknown } | undefined;
          if (f?.id) folder = { id: String(f.id), name: String(f.name ?? '') };
        } else {
          const f = folderRaw as { id?: unknown; name?: unknown };
          if (f.id) folder = { id: String(f.id), name: String(f.name ?? '') };
        }
      }
      return {
        id: String(raw.id ?? ''),
        title: String(raw.title ?? ''),
        description: raw.description != null ? String(raw.description) : '',
        file_name: String(raw.file_name ?? ''),
        mime_type: String(raw.mime_type ?? ''),
        byte_size: Number(raw.byte_size ?? 0),
        storage_path: String(raw.storage_path ?? ''),
        updated_at: String(raw.updated_at ?? ''),
        folder_id: raw.folder_id != null ? String(raw.folder_id) : null,
        staff_resource_folders: folder,
      };
    },
    staleTime: 30_000,
  });

  const storagePath = detailQuery.data?.storage_path;
  const row = detailQuery.data;

  const previewKind = row ? getPreviewKind(row.mime_type, row.file_name) : null;

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

  const signedUrl = signedUrlQuery.data;

  useEffect(() => {
    if (previewKind !== 'text' || !signedUrl || !row) {
      setTextBody(null);
      setTextErr(null);
      setTextBusy(false);
      return;
    }
    if (row.byte_size > TEXT_PREVIEW_MAX_BYTES) {
      setTextErr('File too large to preview.');
      setTextBody(null);
      return;
    }
    let cancelled = false;
    setTextBusy(true);
    setTextErr(null);
    setTextBody(null);
    void (async () => {
      try {
        const res = await fetch(signedUrl);
        if (cancelled) return;
        if (!res.ok) {
          setTextErr('Could not load text.');
          return;
        }
        const t = await res.text();
        if (cancelled) return;
        setTextBody(t);
      } catch {
        if (!cancelled) setTextErr('Could not load text.');
      } finally {
        if (!cancelled) setTextBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewKind, signedUrl, row]);

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

  if (detailQuery.error || !row) {
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

  const folder = row.staff_resource_folders;

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

        {folder ? (
          <Pressable onPress={() => router.push(`/resources?folder=${folder.id}`)} style={{ marginTop: 10 }}>
            <Text style={{ fontSize: 13, color: tokens.textSecondary }}>
              Folder:{' '}
              <Text style={{ fontWeight: '600', color: tokens.accent, textDecorationLine: 'underline' }}>
                {folder.name}
              </Text>
            </Text>
          </Pressable>
        ) : null}

        {signedUrl ? (
          <>
            {previewKind === 'image' ? (
              <Image
                source={{ uri: signedUrl }}
                style={{ marginTop: 16, width: '100%', height: 280, resizeMode: 'contain' }}
                accessibilityIgnoresInvertColors
              />
            ) : null}
            {previewKind === 'video' ? (
              <Video
                source={{ uri: signedUrl }}
                style={{ marginTop: 16, width: '100%', height: 220 }}
                useNativeControls
                resizeMode={ResizeMode.CONTAIN}
              />
            ) : null}
            {previewKind === 'audio' ? (
              <Text style={{ marginTop: 12, color: tokens.textSecondary, fontSize: 13 }}>
                Tap Open below to play audio in your default app.
              </Text>
            ) : null}
            {previewKind === 'text' ? (
              <View
                style={{
                  marginTop: 16,
                  padding: 12,
                  borderRadius: 10,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: tokens.border,
                  backgroundColor: cardBg,
                  maxHeight: 360,
                }}
              >
                {textBusy ? (
                  <Text style={{ color: tokens.textSecondary }}>Loading text…</Text>
                ) : textErr ? (
                  <Text style={{ color: tokens.warning }}>{textErr}</Text>
                ) : textBody != null ? (
                  <Text style={{ fontFamily: 'Menlo', fontSize: 12, color: tokens.textPrimary }}>{textBody}</Text>
                ) : null}
              </View>
            ) : null}
            <Pressable
              onPress={() => void Linking.openURL(signedUrl)}
              style={({ pressed }) => [
                styles.btn,
                { backgroundColor: tokens.textPrimary, opacity: pressed ? 0.9 : 1, marginTop: 16 },
              ]}
            >
              <Text style={{ color: scheme === 'dark' ? tokens.background : '#faf9f6', fontWeight: '600' }}>
                {previewKind === 'pdf'
                  ? 'Open PDF'
                  : previewKind === 'audio'
                    ? 'Play audio'
                    : 'Open / download'}
              </Text>
            </Pressable>
          </>
        ) : (
          <Text style={{ color: tokens.textMuted, marginTop: 12 }}>
            {signedUrlQuery.error ? 'Could not prepare file.' : 'Preparing file…'}
          </Text>
        )}

        <Text style={[styles.meta, { color: tokens.textMuted, marginTop: 8 }]}>
          {row.file_name} · {formatBytes(row.byte_size)} · {new Date(row.updated_at).toLocaleString()}
        </Text>

        {row.id ? <ResourceDocumentAssistant resourceId={row.id} /> : null}
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
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
});
