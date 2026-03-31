import { PROFILE_ROLES, canVerifyStaffDiscountQr, type ProfileRole } from '@campsite/types';
import { useCampsiteTheme } from '@campsite/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { TabSafeScreen } from '@/components/shell/TabSafeScreen';
import type { ProfileRow } from '@/lib/AuthContext';
import {
  clearDiscountCache,
  isDiscountCacheUsable,
  readDiscountCache,
  writeDiscountCache,
  type DiscountQrCached,
} from '@/lib/discountQrCache';
import { buildRandomSeed, QR_SEED } from '@/lib/discountQrPlaceholderSeed';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { callStaffEdgeFunction, type MintTokenResponse } from '@/lib/staffDiscountEdge';

import { PlaceholderQrGrid } from './PlaceholderQrGrid';

type TierRow = {
  id: string;
  role: ProfileRole;
  label: string;
  discount_value: string | null;
  valid_at: string | null;
};

function roleSortIndex(role: ProfileRole): number {
  const i = PROFILE_ROLES.indexOf(role);
  return i === -1 ? 999 : i;
}

function formatRole(role: string): string {
  return role.replace(/_/g, ' ');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function useExpiresCountdown(expiresAtIso: string | null): string | null {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (!expiresAtIso) return null;
  void tick;
  const ms = new Date(expiresAtIso).getTime() - Date.now();
  if (ms <= 0) return '00:00:00';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

export function DiscountCardScreen({ profile }: { profile: ProfileRow }) {
  const { tokens } = useCampsiteTheme();
  const qc = useQueryClient();
  const configured = isSupabaseConfigured();
  const canScan = canVerifyStaffDiscountQr(profile.role as ProfileRole);
  const [qrSeed, setQrSeed] = useState<number[][]>(() => QR_SEED);

  const orgQuery = useQuery({
    queryKey: ['mobile-discount-org-name', profile.org_id],
    enabled: Boolean(profile.org_id && configured),
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('organisations')
        .select('name')
        .eq('id', profile.org_id!)
        .maybeSingle();
      if (error) throw error;
      return (data?.name as string | null) ?? null;
    },
  });

  const tiersQuery = useQuery({
    queryKey: ['mobile-discount-tiers', profile.org_id, profile.id, profile.role],
    enabled: Boolean(profile.org_id && configured),
    queryFn: async () => {
      const supabase = getSupabase();
      const [mine, list] = await Promise.all([
        supabase
          .from('discount_tiers')
          .select('id, role, label, discount_value, valid_at')
          .eq('org_id', profile.org_id!)
          .eq('role', profile.role)
          .maybeSingle(),
        supabase
          .from('discount_tiers')
          .select('id, role, label, discount_value, valid_at')
          .eq('org_id', profile.org_id!),
      ]);
      if (mine.error) throw mine.error;
      if (list.error) throw list.error;
      const rows = (list.data ?? []) as TierRow[];
      rows.sort((a, b) => roleSortIndex(a.role) - roleSortIndex(b.role));
      return { mine: (mine.data as TierRow | null) ?? null, all: rows };
    },
  });

  const fetchFreshToken = useCallback(async (): Promise<DiscountQrCached> => {
    const res = await callStaffEdgeFunction(getSupabase(), 'staff-discount-token', {});
    if (!res.ok) {
      throw new Error(res.message);
    }
    const data = res.data as MintTokenResponse;
    if (!data?.token || !data?.expiresAt) {
      throw new Error('Invalid token response');
    }
    const cached: DiscountQrCached = {
      token: data.token,
      expiresAt: data.expiresAt,
      issuedAt: data.issuedAt,
    };
    await writeDiscountCache(cached);
    return cached;
  }, []);

  const tokenQuery = useQuery({
    queryKey: ['discount-qr', profile.org_id, profile.id],
    enabled: Boolean(profile.org_id && configured),
    queryFn: async (): Promise<DiscountQrCached> => {
      const cached = await readDiscountCache();
      if (cached && isDiscountCacheUsable(cached.expiresAt)) {
        return cached;
      }
      return fetchFreshToken();
    },
    staleTime: 60_000,
  });

  const refreshTokenMut = useMutation({
    mutationFn: async () => {
      await clearDiscountCache();
      return fetchFreshToken();
    },
    onSuccess: (data) => {
      qc.setQueryData(['discount-qr', profile.org_id!, profile.id], data);
      setQrSeed(buildRandomSeed(QR_SEED.length, QR_SEED[0]!.length));
    },
  });

  const tierRow = tiersQuery.data?.mine ?? null;
  const allTiers = tiersQuery.data?.all ?? [];
  const tierLoading = tiersQuery.isPending;
  const tierConfigured = !tierLoading && tierRow !== null;
  const discountDisplay =
    tierRow?.discount_value?.trim() || tierRow?.label || (tierConfigured ? '-' : 'Not configured');

  const tokenData = tokenQuery.data;
  const tokenError =
    tokenQuery.isError && tokenQuery.error
      ? tokenQuery.error instanceof Error
        ? tokenQuery.error.message
        : String(tokenQuery.error)
      : null;
  const showRealQr = Boolean(tokenData?.token && !tokenQuery.isError);
  const countdown = useExpiresCountdown(showRealQr ? tokenData!.expiresAt : null);

  const refreshing =
    tiersQuery.isRefetching ||
    tokenQuery.isRefetching ||
    orgQuery.isRefetching ||
    refreshTokenMut.isPending;

  const onRefreshQr = () => {
    refreshTokenMut.mutate(undefined, {
      onError: (e: Error) => {
        Alert.alert('Could not refresh QR', e.message);
      },
    });
  };

  if (!profile.org_id) {
    return (
      <TabSafeScreen>
        <View style={[styles.center, { backgroundColor: tokens.background }]}>
          <Text style={{ color: tokens.textSecondary }}>Sign in to view your discount card.</Text>
        </View>
      </TabSafeScreen>
    );
  }

  return (
    <TabSafeScreen>
      <ScrollView
        style={{ flex: 1, backgroundColor: tokens.background }}
        contentContainerStyle={styles.scrollPad}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void tiersQuery.refetch();
              void tokenQuery.refetch();
              void orgQuery.refetch();
            }}
            tintColor={tokens.textPrimary}
            colors={[tokens.textPrimary]}
          />
        }
      >
        <View style={styles.cardDark}>
          <View style={styles.cardGlowTop} />
          <View style={styles.cardGlowBottom} />

          <Text style={styles.orgLabel}>{orgQuery.data ?? 'Organisation'}</Text>
          <Text style={styles.nameTitle}>{profile.full_name ?? 'Member'}</Text>
          <Text style={styles.roleLine}>{formatRole(profile.role)}</Text>

          <View style={styles.qrFrame}>
            {tokenQuery.isPending && !tokenData ? (
              <ActivityIndicator color="#121212" />
            ) : showRealQr ? (
              <QRCode value={tokenData!.token} size={104} backgroundColor="#ffffff" color="#121212" />
            ) : (
              <PlaceholderQrGrid seed={qrSeed} size={104} />
            )}
          </View>

          {tokenError ? (
            <Text style={styles.tokenErr} numberOfLines={3}>
              {tokenError}
            </Text>
          ) : null}

          <View style={styles.discountRow}>
            <Text style={styles.discountRowLabel}>Staff Discount</Text>
            <Text style={styles.discountRowValue}>{discountDisplay}</Text>
          </View>

          <Text style={styles.countdownLine}>
            {countdown ? (
              <>
                QR refreshes in <Text style={styles.countdownMono}>{countdown}</Text>
              </>
            ) : (
              <>Pull to refresh if your code expired</>
            )}
          </Text>
        </View>

        <View style={styles.btnRow}>
          <Pressable
            style={[styles.ghostBtn, { borderColor: tokens.border }]}
            onPress={onRefreshQr}
            disabled={refreshTokenMut.isPending}
          >
            <Text style={{ color: tokens.textPrimary, fontWeight: '600' }}>
              {refreshTokenMut.isPending ? 'Refreshing…' : 'Refresh QR'}
            </Text>
          </Pressable>
          {canScan ? (
            <Pressable
              style={[styles.ghostBtn, { borderColor: tokens.border }]}
              onPress={() =>
                Alert.alert(
                  'Scan on web',
                  'Staff discount scanning uses the camera. Open Campsite in your browser and use Discount → Scan a card.',
                )
              }
            >
              <Text style={{ color: tokens.textPrimary, fontWeight: '600' }}>How to scan</Text>
            </Pressable>
          ) : null}
        </View>

        {!showRealQr && !tokenQuery.isPending ? (
          <Text style={[styles.hint, { color: tokens.textSecondary }]}>
            If the server isn’t configured for signed QR codes yet, you’ll see a demo pattern only — it won’t scan at
            checkout.
          </Text>
        ) : (
          <Text style={[styles.hint, { color: tokens.textSecondary }]}>
            Show this code at participating venues. It matches your role’s discount tier.
          </Text>
        )}

        <Text style={[styles.sectionTitle, { color: tokens.textPrimary }]}>Discount tiers</Text>

        {tierLoading ? (
          <ActivityIndicator color={tokens.textPrimary} style={{ marginTop: 12 }} />
        ) : !tierConfigured ? (
          <View style={styles.warnBox}>
            <Text style={styles.warnText}>No discount configured for your role. Contact your admin.</Text>
          </View>
        ) : null}

        <View style={[styles.tierTable, { borderColor: tokens.border }]}>
          {allTiers.length === 0 ? (
            <Text style={[styles.tierEmpty, { color: tokens.textSecondary }]}>No tiers configured for your organisation.</Text>
          ) : (
            allTiers.map((t, idx) => {
              const current = t.role === profile.role;
              const last = idx === allTiers.length - 1;
              return (
                <View
                  key={t.id}
                  style={[
                    styles.tierRow,
                    { borderBottomColor: tokens.border },
                    last && { borderBottomWidth: 0 },
                    current && { backgroundColor: tokens.surface },
                  ]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.tierLabel, { color: tokens.textPrimary }]}>{t.label}</Text>
                    {current ? (
                      <Text style={[styles.tierSub, { color: tokens.textSecondary }]}>Your current tier</Text>
                    ) : null}
                    {t.valid_at ? (
                      <Text style={[styles.tierSub, { color: tokens.textSecondary }]}>Valid at: {t.valid_at}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.tierPct}>{t.discount_value?.trim() || '-'}</Text>
                </View>
              );
            })
          )}
        </View>

        <View style={[styles.howBox, { borderColor: tokens.border }]}>
          <Text style={[styles.howTitle, { color: tokens.textPrimary }]}>How it works</Text>
          <Text style={[styles.howBody, { color: tokens.textSecondary }]}>
            Show your QR code at participating venues. The cashier scans it with Campsite to verify your employment and
            apply the correct discount. Your tier follows your current role.
          </Text>
        </View>
      </ScrollView>
    </TabSafeScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  scrollPad: { padding: 20, paddingBottom: 48 },
  cardDark: {
    maxWidth: 360,
    alignSelf: 'center',
    width: '100%',
    borderRadius: 18,
    backgroundColor: '#121212',
    paddingHorizontal: 26,
    paddingTop: 26,
    paddingBottom: 22,
    overflow: 'hidden',
  },
  cardGlowTop: {
    position: 'absolute',
    right: -60,
    top: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  cardGlowBottom: {
    position: 'absolute',
    left: -40,
    bottom: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  orgLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: 'rgba(250,249,246,0.4)',
  },
  nameTitle: {
    marginTop: 18,
    fontSize: 22,
    fontWeight: '600',
    color: '#faf9f6',
    letterSpacing: -0.3,
  },
  roleLine: {
    marginTop: 4,
    fontSize: 12.5,
    color: 'rgba(250,249,246,0.5)',
    textTransform: 'capitalize',
  },
  qrFrame: {
    marginTop: 20,
    marginBottom: 18,
    alignSelf: 'center',
    width: 120,
    height: 120,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tokenErr: {
    fontSize: 11,
    color: 'rgba(252,165,165,0.95)',
    marginBottom: 10,
    textAlign: 'center',
  },
  discountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  discountRowLabel: { fontSize: 12, color: 'rgba(250,249,246,0.55)' },
  discountRowValue: { fontSize: 20, fontWeight: '600', color: '#faf9f6' },
  countdownLine: {
    marginTop: 10,
    fontSize: 11,
    color: 'rgba(250,249,246,0.3)',
    textAlign: 'right',
  },
  countdownMono: { fontVariant: ['tabular-nums'] },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14, maxWidth: 360, alignSelf: 'center' },
  ghostBtn: {
    flex: 1,
    minWidth: 120,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  hint: { fontSize: 11, lineHeight: 16, marginTop: 12, maxWidth: 360, alignSelf: 'center' },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginTop: 28, letterSpacing: -0.2 },
  warnBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
  },
  warnText: { fontSize: 14, color: '#92400e' },
  tierTable: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  tierEmpty: { padding: 16, fontSize: 14 },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tierLabel: { fontSize: 13.5, fontWeight: '600' },
  tierSub: { fontSize: 12, marginTop: 2 },
  tierPct: { fontSize: 17, fontWeight: '600', color: '#166534' },
  howBox: {
    marginTop: 20,
    padding: 18,
    borderRadius: 12,
    borderWidth: 1,
  },
  howTitle: { fontSize: 14, fontWeight: '600' },
  howBody: { marginTop: 8, fontSize: 13, lineHeight: 20 },
});
