import { useCampsiteTheme, useToast } from '@campsite/ui';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { buildPicsumBackdropPhotos, type BackdropPhotoPayload } from '@/lib/broadcastBackdropPicsum';
import { getSupabase } from '@/lib/supabase';
import { uploadBroadcastCoverFromUri } from '@/lib/uploadBroadcastCoverMobile';

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export type UnsplashPhotoPayload = BackdropPhotoPayload;

type BackdropMode = 'none' | 'image';

type Props = {
  visible: boolean;
  onClose: () => void;
  siteUrl: string;
  broadcastId: string;
  userId: string;
  coverImageUrl: string | null;
  canSetCover: boolean;
  backdropBlur: boolean;
  onBackdropBlurChange: (blur: boolean) => void;
  onCoverUpdated: () => void;
};

export function BroadcastBackdropModal({
  visible,
  onClose,
  siteUrl,
  broadcastId,
  userId,
  coverImageUrl,
  canSetCover,
  backdropBlur,
  onBackdropBlurChange,
  onCoverUpdated,
}: Props) {
  const { tokens, scheme } = useCampsiteTheme();
  const { show: showToast } = useToast();
  const insets = useSafeAreaInsets();

  const [photos, setPhotos] = useState<UnsplashPhotoPayload[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [photosErr, setPhotosErr] = useState<string | null>(null);
  const [source, setSource] = useState<'unsplash' | 'picsum' | null>(null);
  const [mode, setMode] = useState<BackdropMode>('image');
  const [shuffleKey, setShuffleKey] = useState(0);
  const [coverBusy, setCoverBusy] = useState(false);

  /** Hermes can break closure over destructured props after `await`; read these from a ref in async paths. */
  const coverCtxRef = useRef({ canSetCover, broadcastId, userId });
  coverCtxRef.current = { canSetCover, broadcastId, userId };

  const loadPhotos = useCallback(async () => {
    setPhotosLoading(true);
    setPhotosErr(null);
    const base = siteUrl.replace(/\/$/, '');

    const applyPicsumFallback = () => {
      setPhotos(buildPicsumBackdropPhotos(shuffleKey));
      setSource('picsum');
    };

    if (!base) {
      applyPicsumFallback();
      setPhotosLoading(false);
      return;
    }

    try {
      const res = await fetch(`${base}/api/unsplash/photos?k=${shuffleKey}`, { cache: 'no-store' });
      const data = (await res.json()) as {
        ok?: boolean;
        photos?: UnsplashPhotoPayload[];
        source?: string;
        error?: string;
      };
      if (!res.ok || !data.photos?.length) {
        applyPicsumFallback();
        return;
      }
      setPhotos(data.photos);
      setSource(data.source === 'unsplash' ? 'unsplash' : 'picsum');
    } catch {
      applyPicsumFallback();
    } finally {
      setPhotosLoading(false);
    }
  }, [shuffleKey, siteUrl]);

  useEffect(() => {
    if (!visible) return;
    setPhotos([]);
    void loadPhotos();
  }, [visible, loadPhotos]);

  useEffect(() => {
    if (coverImageUrl) setMode('image');
    else setMode('none');
  }, [coverImageUrl, visible]);

  const trackUnsplashDownload = (downloadLocation: string | null | undefined) => {
    const dl = typeof downloadLocation === 'string' ? downloadLocation.trim() : '';
    if (!dl || !siteUrl) return;
    const base = siteUrl.replace(/\/$/, '');
    void fetch(`${base}/api/unsplash/track-download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ downloadLocation: dl }),
    });
  };

  const applyImageUrl = async (url: string, downloadLocation?: string | null) => {
    const { canSetCover: allow, broadcastId: bid } = coverCtxRef.current;
    if (!allow || coverBusy) return;
    trackUnsplashDownload(downloadLocation ?? null);
    setCoverBusy(true);
    try {
      const { error } = await getSupabase().from('broadcasts').update({ cover_image_url: url }).eq('id', bid);
      if (error) {
        showToast(error.message);
        return;
      }
      onCoverUpdated();
      showToast('Backdrop updated');
    } finally {
      setCoverBusy(false);
    }
  };

  const removeCover = async () => {
    const { canSetCover: allow, broadcastId: bid } = coverCtxRef.current;
    if (!allow || coverBusy) return;
    setCoverBusy(true);
    try {
      const { error } = await getSupabase().from('broadcasts').update({ cover_image_url: null }).eq('id', bid);
      if (error) {
        showToast(error.message);
        return;
      }
      onBackdropBlurChange(false);
      onCoverUpdated();
      showToast('Backdrop removed');
    } finally {
      setCoverBusy(false);
    }
  };

  const pickAndUpload = async () => {
    if (!coverCtxRef.current.canSetCover || coverBusy) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showToast('Photo library access is needed to insert an image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const mime = asset.mimeType ?? 'image/jpeg';
    const { userId: uid, broadcastId: bid } = coverCtxRef.current;
    setCoverBusy(true);
    try {
      const up = await uploadBroadcastCoverFromUri(getSupabase(), uid, bid, asset.uri, mime);
      if (!up.ok) {
        showToast(up.message);
        return;
      }
      const { error } = await getSupabase()
        .from('broadcasts')
        .update({ cover_image_url: up.publicUrl })
        .eq('id', bid);
      if (error) {
        showToast(error.message);
        return;
      }
      onCoverUpdated();
      showToast('Cover uploaded');
      onClose();
    } finally {
      setCoverBusy(false);
    }
  };

  const segmentBg = scheme === 'dark' ? 'rgba(255,255,255,0.08)' : '#ecebe8';
  const segmentActive = scheme === 'dark' ? tokens.surface : '#ffffff';
  const cardBorder = scheme === 'dark' ? tokens.border : '#e8e8e8';
  const muted = tokens.textMuted;
  const primary = tokens.textPrimary;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            {
              borderColor: cardBorder,
              backgroundColor: scheme === 'dark' ? tokens.surface : '#ffffff',
              maxHeight: '88%',
              marginBottom: Math.max(insets.bottom, 12),
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: primary }]}>Backdrop</Text>
            <Pressable onPress={onClose} style={styles.closeHit} accessibilityLabel="Close">
              <Text style={[styles.closeGlyph, { color: muted }]}>×</Text>
            </Pressable>
          </View>

          <View style={[styles.segmentRow, { backgroundColor: segmentBg }]}>
            <Segment
              label="No backdrop"
              active={mode === 'none'}
              disabled={!canSetCover || coverBusy}
              activeBg={segmentActive}
              onPress={() => {
                setMode('none');
                if (coverImageUrl) void removeCover();
              }}
            >
              <Text style={[styles.segmentIcon, { color: primary }]}>⊘</Text>
            </Segment>
            <Segment label="Solid (soon)" active={false} disabled activeBg={segmentActive}>
              <View style={[styles.soonBox, { borderColor: primary }]} />
            </Segment>
            <Segment label="Gradient (soon)" active={false} disabled activeBg={segmentActive}>
              <View style={[styles.soonBoxDashed, { borderColor: primary }]} />
            </Segment>
            <Segment
              label="Image"
              active={mode === 'image'}
              disabled={!canSetCover}
              activeBg={segmentActive}
              onPress={() => setMode('image')}
            >
              <Text style={[styles.segmentIcon, { color: primary }]}>▣</Text>
            </Segment>
          </View>

          {mode === 'image' ? (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
              {photosLoading ? (
                <View style={styles.centerBlock}>
                  <ActivityIndicator color={primary} />
                  <Text style={[styles.hint, { color: muted }]}>Loading images…</Text>
                </View>
              ) : photosErr ? (
                <Text style={[styles.errText, { color: tokens.warning }]}>{photosErr}</Text>
              ) : (
                <View>
                  {chunk(photos, 3).map((row, ri) => (
                    <View key={`row-${ri}`} style={styles.gridRow}>
                      {row.map((p) => {
                        const selected = coverImageUrl === p.urls.regular;
                        return (
                          <Pressable
                            key={p.id}
                            disabled={!canSetCover || coverBusy}
                            onPress={() => void applyImageUrl(p.urls.regular, p.downloadLocation)}
                            style={({ pressed }) => [
                              styles.thumbWrap,
                              {
                                opacity: !canSetCover || coverBusy ? 0.45 : pressed ? 0.9 : 1,
                                borderColor: selected ? tokens.textPrimary : 'transparent',
                              },
                            ]}
                          >
                            <Image source={{ uri: p.urls.small }} style={styles.thumb} contentFit="cover" />
                          </Pressable>
                        );
                      })}
                      {row.length < 3
                        ? Array.from({ length: 3 - row.length }).map((_, pi) => (
                            <View key={`pad-${ri}-${pi}`} style={styles.thumbPad} />
                          ))
                        : null}
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.actionsRow}>
                <Pressable
                  disabled={!canSetCover || coverBusy || photosLoading}
                  onPress={() => setShuffleKey((k) => k + 1)}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    { borderColor: cardBorder, opacity: pressed ? 0.85 : 1, backgroundColor: tokens.background },
                  ]}
                >
                  <Text style={[styles.actionBtnText, { color: primary }]}>↻ Shuffle</Text>
                </Pressable>
                <Pressable
                  onPress={() => void Linking.openURL('https://unsplash.com')}
                  style={[styles.actionBtn, { borderColor: cardBorder, backgroundColor: tokens.background }]}
                >
                  <Text style={[styles.actionBtnText, { color: primary }]}>Unsplash</Text>
                </Pressable>
                <Pressable
                  disabled={!canSetCover || coverBusy}
                  onPress={() => void pickAndUpload()}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    { borderColor: cardBorder, opacity: pressed ? 0.85 : 1, backgroundColor: tokens.background },
                  ]}
                >
                  <Text style={[styles.actionBtnText, { color: primary }]}>Insert</Text>
                </Pressable>
              </View>

              {source === 'unsplash' && photos.length > 0 ? (
                <Text style={[styles.attribution, { color: muted }]}>
                  Photos from Unsplash (unsplash.com)
                </Text>
              ) : null}
              {source === 'picsum' && photos.length > 0 ? (
                <Text style={[styles.attribution, { color: muted }]}>
                  Photos from Lorem Picsum (picsum.photos)same fallback as the web API without Unsplash.
                </Text>
              ) : null}

              <View style={[styles.blurRow, { borderColor: cardBorder, backgroundColor: tokens.background }]}>
                <Text style={[styles.blurLabel, { color: primary }]}>Blur image</Text>
                <Switch
                  value={backdropBlur}
                  disabled={!coverImageUrl}
                  onValueChange={(v) => {
                    onBackdropBlurChange(v);
                  }}
                  trackColor={{ false: '#d8d8d8', true: '#121212' }}
                  thumbColor="#ffffff"
                />
              </View>
            </ScrollView>
          ) : (
            <View style={styles.noBackdropHint}>
              <Text style={[styles.hint, { color: muted }]}>No backdrop is shown behind the card.</Text>
            </View>
          )}

          {coverBusy ? (
            <View
              style={[
                styles.busyOverlay,
                { backgroundColor: scheme === 'dark' ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.72)' },
              ]}
              pointerEvents="auto"
            >
              <ActivityIndicator color={primary} size="large" />
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Segment({
  label,
  active,
  disabled,
  onPress,
  children,
  activeBg,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onPress?: () => void;
  children: ReactNode;
  activeBg: string;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={disabled ? undefined : onPress}
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled }}
      style={({ pressed }) => {
        const base = {
          backgroundColor: active && !disabled ? activeBg : 'transparent',
          opacity: disabled ? 0.35 : pressed ? 0.88 : 1,
        };
        if (Platform.OS === 'ios' && active && !disabled) {
          return [
            styles.segment,
            base,
            {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.12,
              shadowRadius: 3,
            },
          ];
        }
        if (Platform.OS === 'android' && active && !disabled) {
          return [styles.segment, base, { elevation: 2 }];
        }
        return [styles.segment, base];
      }}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  sheet: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sheetTitle: { fontSize: 17, fontWeight: '600' },
  closeHit: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  closeGlyph: { fontSize: 26, lineHeight: 28 },
  segmentRow: {
    flexDirection: 'row',
    gap: 4,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 4,
    borderRadius: 16,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentIcon: { fontSize: 16, fontWeight: '600' },
  soonBox: { width: 16, height: 16, borderRadius: 3, borderWidth: 2, opacity: 0.4 },
  soonBoxDashed: {
    width: 16,
    height: 16,
    borderRadius: 3,
    borderWidth: 2,
    borderStyle: 'dashed',
    opacity: 0.4,
  },
  scroll: { maxHeight: 420 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 20 },
  centerBlock: { paddingVertical: 32, alignItems: 'center', gap: 12 },
  hint: { fontSize: 14, textAlign: 'center' },
  errText: { textAlign: 'center', paddingVertical: 16, fontSize: 14 },
  gridRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  thumbWrap: {
    flex: 1,
    aspectRatio: 4 / 3,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    backgroundColor: '#ecebe8',
  },
  thumbPad: { flex: 1 },
  thumb: { width: '100%', height: '100%' },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  actionBtnText: { fontSize: 12, fontWeight: '600' },
  attribution: { marginTop: 12, fontSize: 10, textAlign: 'center', lineHeight: 15 },
  blurRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  blurLabel: { fontSize: 14, fontWeight: '600' },
  noBackdropHint: { paddingHorizontal: 16, paddingBottom: 24, paddingTop: 8 },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
