import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { isOrgAdminRole } from '@campsite/types';
import { useCampsiteTheme } from '@campsite/ui';
import { BlurView } from 'expo-blur';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BroadcastBackdropModal } from '@/components/broadcasts/BroadcastBackdropModal';
import { BroadcastMetaChips } from '@/components/broadcasts/BroadcastMetaChips';
import { useAuth } from '@/lib/AuthContext';
import { enrichMobileBroadcastRows, type MobileBroadcastRow } from '@/lib/broadcastEnrichRows';
import { prefetchBroadcastCover } from '@/lib/broadcastCoverPrefetch';
import { findBroadcastRowInQueryCache } from '@/lib/broadcastDetailFromCache';
import { parseRawBroadcastRecord } from '@/lib/broadcastFeedQuery';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

const AI_SUMMARY_MIN_CHARS = 480;

function formatSentAt(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '';
  }
}

type DetailPayload = { row: MobileBroadcastRow; status: string; orgId: string | null };

function rpcBooleanTrue(data: unknown): boolean {
  return data === true || data === 'true' || data === 't';
}

export default function BroadcastDetailScreen() {
  const { tokens, scheme } = useCampsiteTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { profile, configured, session, user } = useAuth();
  const orgId = profile?.org_id ?? null;
  const userId = profile?.id ?? user?.id ?? null;

  const rawId = useLocalSearchParams<{ id: string }>().id;
  const broadcastId = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] : '';

  const [backdropBlur, setBackdropBlur] = useState(false);
  const [backdropModalOpen, setBackdropModalOpen] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiSummaryErr, setAiSummaryErr] = useState<string | null>(null);
  const [aiSummaryBusy, setAiSummaryBusy] = useState(false);

  const siteUrl = useMemo(() => {
    const raw = (Constants.expoConfig?.extra as { siteUrl?: string } | undefined)?.siteUrl?.trim() ?? '';
    return raw.replace(/\/$/, '');
  }, []);

  const maySetCoverQuery = useQuery({
    queryKey: ['broadcast-may-set-cover', broadcastId, userId],
    enabled: Boolean(broadcastId && userId && configured && isSupabaseConfigured()),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc('broadcast_may_set_cover', {
        p_broadcast_id: broadcastId,
      });
      if (error) return false;
      return rpcBooleanTrue(data);
    },
  });

  const detailQuery = useQuery({
    queryKey: ['mobile-broadcast-detail', broadcastId, userId],
    enabled: Boolean(broadcastId && userId && configured && isSupabaseConfigured()),
    placeholderData: (previousData): DetailPayload | undefined => {
      if (previousData) return previousData;
      const row = findBroadcastRowInQueryCache(queryClient, broadcastId);
      return row ? { row, status: 'sent', orgId: null } : undefined;
    },
    queryFn: async (): Promise<DetailPayload | null> => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('broadcasts')
        .select(
          'id, org_id, title, body, status, sent_at, is_mandatory, is_pinned, is_org_wide, cover_image_url, dept_id, channel_id, team_id, created_by',
        )
        .eq('id', broadcastId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const raw = parseRawBroadcastRecord(data as Record<string, unknown>);
      if (!raw) return null;
      const [row] = await enrichMobileBroadcastRows(supabase, userId!, [raw]);
      const oid = (data as { org_id?: string }).org_id;
      return {
        row,
        status: String((data as { status?: string }).status ?? ''),
        orgId: oid != null ? String(oid) : null,
      };
    },
  });

  const detail = detailQuery.data;
  const coverUrl = detail?.row.cover_image_url?.trim() ? detail.row.cover_image_url : null;

  useLayoutEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    if (!coverUrl) return;
    prefetchBroadcastCover(coverUrl);
  }, [coverUrl]);

  useEffect(() => {
    setAiSummary(null);
    setAiSummaryErr(null);
    setAiSummaryBusy(false);
  }, [broadcastId]);

  useEffect(() => {
    if (!detail?.row?.id || !userId) return;
    if (detail.status && detail.status !== 'sent') return;
    const supabase = getSupabase();
    void supabase
      .from('broadcast_reads')
      .upsert({ broadcast_id: detail.row.id, user_id: userId }, { onConflict: 'broadcast_id,user_id' })
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ['mobile-broadcast-feed'] });
      });
  }, [detail?.row?.id, detail?.status, userId, queryClient]);

  const requestAiSummary = async () => {
    if (!detail || !siteUrl || !session?.access_token) return;
    setAiSummaryBusy(true);
    setAiSummaryErr(null);
    try {
      const res = await fetch(`${siteUrl}/api/broadcasts/summarize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ title: detail.row.title, body: detail.row.body }),
      });
      let data: { summary?: string; error?: string; message?: string } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        const msg =
          data.error === 'not_configured' && typeof data.message === 'string'
            ? data.message
            : typeof data.error === 'string'
              ? data.error
              : 'Could not summarise.';
        setAiSummaryErr(msg);
        return;
      }
      if (typeof data.summary === 'string' && data.summary.trim()) {
        setAiSummary(data.summary.trim());
      } else {
        setAiSummaryErr('No summary returned.');
      }
    } catch {
      setAiSummaryErr('Network error.');
    } finally {
      setAiSummaryBusy(false);
    }
  };

  const mdStyles = useMemo(
    () => ({
      body: { color: tokens.textPrimary, fontSize: 15, lineHeight: 22 },
      heading1: { color: tokens.textPrimary, fontSize: 20, fontWeight: '700' as const, marginVertical: 8 },
      heading2: { color: tokens.textPrimary, fontSize: 18, fontWeight: '700' as const, marginVertical: 6 },
      bullet_list: { marginVertical: 4 },
      ordered_list: { marginVertical: 4 },
      list_item: { color: tokens.textPrimary, fontSize: 15, lineHeight: 22 },
      link: { color: tokens.accent },
      code_inline: { backgroundColor: tokens.surface, color: tokens.textPrimary },
      fence: { backgroundColor: tokens.surface, color: tokens.textPrimary },
    }),
    [tokens],
  );

  const pageBg = tokens.background;
  const cardBg = scheme === 'dark' ? tokens.surface : '#ffffff';

  if (!configured || !isSupabaseConfigured()) {
    return (
      <View style={[styles.root, { backgroundColor: pageBg, paddingTop: insets.top + 16 }]}>
        <Pressable onPress={() => router.back()} style={styles.backPlain}>
          <Text style={{ color: tokens.textPrimary, fontWeight: '600' }}>← Back</Text>
        </Pressable>
        <Text style={{ color: tokens.textSecondary, marginTop: 24, paddingHorizontal: 20 }}>
          Connect Supabase to load broadcasts.
        </Text>
      </View>
    );
  }

  if (!orgId || !userId) {
    return (
      <View style={[styles.root, { backgroundColor: pageBg, paddingTop: insets.top + 16 }]}>
        <Pressable onPress={() => router.back()} style={styles.backPlain}>
          <Text style={{ color: tokens.textPrimary, fontWeight: '600' }}>← Back</Text>
        </Pressable>
        <Text style={{ color: tokens.textSecondary, marginTop: 24, paddingHorizontal: 20 }}>
          Complete registration to view broadcasts.
        </Text>
      </View>
    );
  }

  if (!broadcastId) {
    return (
      <View style={[styles.root, { backgroundColor: pageBg, paddingTop: insets.top + 16 }]}>
        <Pressable onPress={() => router.back()} style={styles.backPlain}>
          <Text style={{ color: tokens.textPrimary, fontWeight: '600' }}>← Back</Text>
        </Pressable>
        <Text style={{ color: tokens.textSecondary, marginTop: 24, paddingHorizontal: 20 }}>Missing broadcast id.</Text>
      </View>
    );
  }

  if (!detail && detailQuery.isPending) {
    return (
      <View style={[styles.root, { backgroundColor: pageBg }]}>
        <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.chromePill,
              { backgroundColor: tokens.surface, borderColor: tokens.border },
              pressed && { opacity: 0.88 },
            ]}
          >
            <Text style={[styles.chromePillText, { color: tokens.textPrimary }]}>← Back</Text>
          </Pressable>
        </View>
        <View style={styles.loadingBody}>
          <ActivityIndicator color={tokens.textPrimary} />
        </View>
      </View>
    );
  }

  if (detailQuery.isError || !detail) {
    return (
      <View style={[styles.root, { backgroundColor: pageBg, paddingTop: insets.top + 16 }]}>
        <Pressable onPress={() => router.back()} style={styles.backPlain}>
          <Text style={{ color: tokens.textPrimary, fontWeight: '600' }}>← Back</Text>
        </Pressable>
        <Text style={{ color: tokens.textSecondary, marginTop: 24, paddingHorizontal: 20 }}>
          {detailQuery.isError
            ? detailQuery.error instanceof Error
              ? detailQuery.error.message
              : 'Could not load this broadcast.'
            : 'This broadcast was not found or you do not have access.'}
        </Text>
      </View>
    );
  }

  const { row, status, orgId: broadcastOrgId } = detail;
  const displayTitle = row.title?.trim() ? row.title.trim() : 'Untitled broadcast';
  const bodyTrimmed = row.body?.trim() ?? '';
  const showAiSummary = bodyTrimmed.length >= AI_SUMMARY_MIN_CHARS;

  /** Match server `broadcast_may_set_cover` org-admin branch when RPC lags, errors, or returns a non-boolean. */
  const effectiveBroadcastOrgId = broadcastOrgId ?? orgId;
  const profileRole = profile?.role?.trim() ?? '';
  const orgAdminCoverFallback =
    profile?.status === 'active' &&
    !!orgId &&
    !!effectiveBroadcastOrgId &&
    orgId === effectiveBroadcastOrgId &&
    (isOrgAdminRole(profileRole) || profileRole === 'administrator');
  const rpcAllowsCover = maySetCoverQuery.data === true;
  const canSetCover = rpcAllowsCover || orgAdminCoverFallback;
  const showCoverTools = canSetCover;

  const onCoverUpdated = () => {
    void queryClient.invalidateQueries({ queryKey: ['mobile-broadcast-detail', broadcastId, userId] });
    void queryClient.invalidateQueries({ queryKey: ['mobile-broadcast-feed'] });
    void queryClient.invalidateQueries({ queryKey: ['mobile-broadcast-search'] });
    void queryClient.invalidateQueries({ queryKey: ['mobile-home'] });
  };

  const backdropImageSource = coverUrl
    ? { uri: coverUrl }
    : (require('@/assets/images/camp-site-main-backdrop.png') as number);
  const backdropRecyclingKey = coverUrl ?? 'camp-site-default-backdrop';

  return (
    <View style={styles.root}>
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: pageBg }]} />
      <View
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Image
          source={backdropImageSource}
          style={[
            StyleSheet.absoluteFillObject,
            backdropBlur ? styles.backdropZoomForBlur : null,
          ]}
          contentFit="cover"
          allowDownscaling={false}
          cachePolicy="memory-disk"
          priority="high"
          recyclingKey={backdropRecyclingKey}
          transition={{ duration: 420, timing: 'ease-out', effect: 'cross-dissolve' }}
        />
        <View
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: scheme === 'dark' ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.07)' },
          ]}
          pointerEvents="none"
        />
        {backdropBlur ? (
          <BlurView
            intensity={Platform.OS === 'ios' ? 38 : 48}
            tint={scheme === 'dark' ? 'dark' : 'light'}
            blurMethod={Platform.OS === 'android' ? 'dimezisBlurViewSdk31Plus' : undefined}
            style={StyleSheet.absoluteFillObject}
          />
        ) : null}
      </View>

      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.chromePill,
            styles.chromeOnBackdrop,
            {
              backgroundColor:
                scheme === 'dark' ? 'rgba(30,30,30,0.78)' : 'rgba(250,249,246,0.88)',
              borderColor: scheme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
            },
            pressed && { opacity: 0.9 },
          ]}
        >
          <Text style={[styles.chromePillText, { color: tokens.textPrimary }]}>← Back</Text>
        </Pressable>
        {showCoverTools ? (
          <Pressable
            onPress={() => setBackdropModalOpen(true)}
            accessibilityLabel="Backdrop and background"
            style={({ pressed }) => [
              styles.iconPill,
              styles.chromeOnBackdrop,
              {
                backgroundColor:
                  scheme === 'dark' ? 'rgba(30,30,30,0.78)' : 'rgba(250,249,246,0.88)',
                borderColor: scheme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
              },
              pressed && { opacity: 0.9 },
            ]}
          >
            <MaterialCommunityIcons name="brush-variant" size={20} color={tokens.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {showCoverTools ? (
        <BroadcastBackdropModal
          visible={backdropModalOpen}
          onClose={() => setBackdropModalOpen(false)}
          siteUrl={siteUrl}
          broadcastId={broadcastId}
          userId={userId!}
          coverImageUrl={coverUrl}
          canSetCover={canSetCover}
          backdropBlur={backdropBlur}
          onBackdropBlurChange={(v) => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setBackdropBlur(v);
          }}
          onCoverUpdated={onCoverUpdated}
        />
      ) : null}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 28 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: cardBg,
              borderColor: scheme === 'dark' ? tokens.border : '#d8d8d8',
            },
          ]}
        >
          {status === 'pending_approval' ? (
            <View style={styles.pendingBanner}>
              <Text style={styles.pendingTitle}>Awaiting approval</Text>
              <Text style={styles.pendingBody}>
                This message is not on the organisation feed yet. An approver still needs to publish or reject it.
              </Text>
            </View>
          ) : null}
          {status && status !== 'sent' && status !== 'pending_approval' ? (
            <View style={styles.draftBanner}>
              <Text style={styles.draftTitle}>Not published</Text>
              <Text style={styles.draftBody}>This broadcast is not on the feed yet.</Text>
            </View>
          ) : null}

          <Text style={[styles.title, { color: tokens.textPrimary }]}>{displayTitle}</Text>
          <Text style={[styles.meta, { color: tokens.textSecondary }]}>{formatSentAt(row.sent_at)}</Text>
          <BroadcastMetaChips row={row} style={{ marginTop: 10 }} />
          {row.author_name ? (
            <Text style={[styles.authorLine, { color: tokens.textMuted }]}>{row.author_name}</Text>
          ) : null}

          {showAiSummary && siteUrl && session?.access_token ? (
            <View style={[styles.aiBox, { borderColor: tokens.border, backgroundColor: tokens.surface }]}>
              <Text style={[styles.aiTitle, { color: tokens.textPrimary }]}>Quick summary</Text>
              <Text style={[styles.aiHint, { color: tokens.textSecondary }]}>
                Generated automatically. Confirm details in the full message below.
              </Text>
              <Pressable
                onPress={() => void requestAiSummary()}
                disabled={aiSummaryBusy}
                style={({ pressed }) => [
                  styles.aiButton,
                  {
                    opacity: aiSummaryBusy ? 0.6 : 1,
                    backgroundColor: pressed && !aiSummaryBusy ? tokens.surface : tokens.background,
                    borderColor: tokens.border,
                  },
                ]}
              >
                <Text style={[styles.aiButtonText, { color: tokens.textPrimary }]}>
                  {aiSummaryBusy ? 'Summarising…' : aiSummary ? 'Regenerate' : 'Summarise'}
                </Text>
              </Pressable>
              {aiSummaryErr ? <Text style={[styles.aiErr, { color: tokens.warning }]}>{aiSummaryErr}</Text> : null}
              {aiSummary ? (
                <Text style={[styles.aiSummaryText, { color: tokens.textPrimary }]}>{aiSummary}</Text>
              ) : !aiSummaryBusy && !aiSummaryErr ? (
                <Text style={[styles.aiHint, { color: tokens.textMuted, marginTop: 8 }]}>Summarise to see the main points.</Text>
              ) : null}
            </View>
          ) : null}

          {bodyTrimmed ? (
            <View style={styles.mdWrap}>
              <Markdown style={mdStyles}>{row.body}</Markdown>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  /** Slight zoom only when a native BlurView sits on top—avoids hard edges without huge upscaling artifacts. */
  backdropZoomForBlur: { transform: [{ scale: 1.04 }] },
  loadingBody: { flex: 1, justifyContent: 'center', paddingBottom: 72 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
    zIndex: 20,
  },
  chromePill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  /** Subtle frosted chips (aligned with web `BroadcastDetailStyleRail`: light border, soft shadow). */
  chromeOnBackdrop: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
      },
      android: { elevation: 2 },
    }),
  },
  chromePillText: { fontSize: 14, fontWeight: '600' },
  iconPill: {
    minWidth: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
  },
  backPlain: { paddingHorizontal: 20, paddingVertical: 8 },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingVertical: 24,
    ...Platform.select({
      ios: {
        shadowColor: '#121212',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
      },
      android: { elevation: 4 },
    }),
  },
  pendingBanner: {
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pendingTitle: { fontSize: 14, fontWeight: '700', color: '#422006' },
  pendingBody: { marginTop: 6, fontSize: 13, lineHeight: 18, color: 'rgba(66,32,6,0.9)' },
  draftBanner: {
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  draftTitle: { fontSize: 14, fontWeight: '700', color: '#171717' },
  draftBody: { marginTop: 6, fontSize: 13, lineHeight: 18, color: '#525252' },
  title: { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  meta: { fontSize: 13, marginTop: 8 },
  authorLine: { fontSize: 13, marginTop: 8 },
  mdWrap: { marginTop: 16 },
  aiBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  aiTitle: { fontSize: 15, fontWeight: '700' },
  aiHint: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  aiButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  aiButtonText: { fontSize: 14, fontWeight: '600' },
  aiErr: { marginTop: 8, fontSize: 13, lineHeight: 18 },
  aiSummaryText: { marginTop: 10, fontSize: 14, lineHeight: 21 },
});
