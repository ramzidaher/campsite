'use client';

import { PROFILE_ROLES, type ProfileRole } from '@campsite/types';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

type TierRow = {
  id: string;
  role: ProfileRole;
  label: string;
  discount_value: string | null;
  valid_at: string | null;
};

/** Static fake QR pattern from [cpasite.html](cpasite.html) `drawQR` - not a scannable payload. */
const QR_SEED: number[][] = [
  [1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1],
  [1, 0, 1, 1, 1, 0, 1, 0, 0, 1, 0, 0, 1, 1, 1, 0, 1],
  [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0],
  [1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0],
  [0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1],
  [1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0],
  [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1],
  [1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 0, 1, 0, 1, 0],
  [1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1, 0],
];

function buildRandomSeed(rows: number, cols: number): number[][] {
  const out: number[][] = [];
  for (let ri = 0; ri < rows; ri++) {
    const row: number[] = [];
    for (let ci = 0; ci < cols; ci++) {
      row.push(Math.random() < 0.48 ? 1 : 0);
    }
    out.push(row);
  }
  return out;
}

function drawFakeQr(canvas: HTMLCanvasElement, seed: number[][]) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const S = 104;
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  canvas.width = S * dpr;
  canvas.height = S * dpr;
  canvas.style.width = `${S}px`;
  canvas.style.height = `${S}px`;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#121212';
  const cell = Math.floor(S / seed.length);
  seed.forEach((row, ri) => {
    row.forEach((bit, ci) => {
      if (bit) ctx.fillRect(ci * cell + 2, ri * cell + 2, cell - 1, cell - 1);
    });
  });
}

function PlaceholderQrCanvas({ seed }: { seed: number[][] }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const canvas = ref.current;
    if (canvas) drawFakeQr(canvas, seed);
  }, [seed]);

  return (
    <canvas
      ref={ref}
      width={104}
      height={104}
      className="block h-[104px] w-[104px]"
      aria-hidden
    />
  );
}

/** Cosmetic countdown like cpasite.html `startCountdown` (not tied to a real token expiry). */
function useMockCountdown(refreshKey: number) {
  const [tick, setTick] = useState(() => 23 * 3600 + 47 * 60 + 12);

  useEffect(() => {
    const h = 20 + Math.floor(Math.random() * 4);
    const m = Math.floor(Math.random() * 60);
    const s = Math.floor(Math.random() * 60);
    setTick(h * 3600 + m * 60 + s);
  }, [refreshKey]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setTick((t) => {
        if (t <= 0) return 23 * 3600 + 59 * 60 + 59;
        return t - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const h = Math.floor(tick / 3600);
  const m = Math.floor((tick % 3600) / 60);
  const s = tick % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function roleSortIndex(role: ProfileRole): number {
  const i = PROFILE_ROLES.indexOf(role);
  return i === -1 ? 999 : i;
}

function formatRole(role: string): string {
  return role.replace(/_/g, ' ');
}

const ghostBtn =
  'flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#d8d8d8] bg-white px-3 py-2.5 text-[13px] font-medium text-[#121212] transition-colors hover:bg-[#f5f4f1] disabled:opacity-50';

export function DiscountCardClient({
  profile,
  orgName,
  canScan,
}: {
  profile: { id: string; org_id: string; role: ProfileRole; full_name: string };
  orgName: string | null;
  canScan: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [tierRow, setTierRow] = useState<TierRow | null>(null);
  const [allTiers, setAllTiers] = useState<TierRow[]>([]);
  const [tierLoading, setTierLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [qrSeed, setQrSeed] = useState<number[][]>(() => QR_SEED);
  const [countdownKey, setCountdownKey] = useState(0);

  const mockCountdown = useMockCountdown(countdownKey);

  const loadTiers = useCallback(async () => {
    setTierLoading(true);
    const [mine, list] = await Promise.all([
      supabase
        .from('discount_tiers')
        .select('id, role, label, discount_value, valid_at')
        .eq('org_id', profile.org_id)
        .eq('role', profile.role)
        .maybeSingle(),
      supabase
        .from('discount_tiers')
        .select('id, role, label, discount_value, valid_at')
        .eq('org_id', profile.org_id),
    ]);
    setTierRow((mine.data as TierRow | null) ?? null);
    const rows = (list.data ?? []) as TierRow[];
    rows.sort((a, b) => roleSortIndex(a.role) - roleSortIndex(b.role));
    setAllTiers(rows);
    setTierLoading(false);
  }, [supabase, profile.org_id, profile.role]);

  useEffect(() => {
    void loadTiers();
  }, [loadTiers]);

  function onRefresh() {
    setRefreshing(true);
    setQrSeed(buildRandomSeed(QR_SEED.length, QR_SEED[0].length));
    setCountdownKey((k) => k + 1);
    window.setTimeout(() => setRefreshing(false), 400);
  }

  const tierConfigured = !tierLoading && tierRow !== null;
  const discountDisplay =
    tierRow?.discount_value?.trim() ||
    tierRow?.label ||
    (tierConfigured ? '-' : 'Not configured');

  const sortedTiers = allTiers;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-7">
      <div className="flex flex-wrap items-start gap-7">
        <div className="w-full shrink-0 sm:w-auto">
          <div className="mb-3.5">
            <h1 className="font-authSerif text-lg tracking-tight text-[#121212]">My Discount Card</h1>
          </div>

          <div className="relative w-full max-w-[320px] overflow-hidden rounded-[18px] bg-[#121212] px-[26px] pb-[22px] pt-[26px] text-[#faf9f6] sm:w-[320px]">
            <div
              className="pointer-events-none absolute -right-[60px] -top-[60px] h-[200px] w-[200px] rounded-full border border-white/[0.07]"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -bottom-10 -left-10 h-[160px] w-[160px] rounded-full border border-white/[0.05]"
              aria-hidden
            />

            <div className="relative z-[1] text-[11.5px] font-medium uppercase tracking-[0.08em] text-white/40">
              {orgName ?? 'Organisation'}
            </div>
            <div className="relative z-[1] mt-[18px] font-authSerif text-[22px] leading-tight">{profile.full_name}</div>
            <div className="relative z-[1] mt-1 text-[12.5px] text-white/50 capitalize">
              {formatRole(profile.role)}
            </div>

            <div
              className="relative z-[1] mx-auto mb-[18px] mt-5 flex h-[120px] w-[120px] items-center justify-center rounded-[10px] bg-white"
              role="img"
              aria-label="Placeholder discount QR pattern (demo only, not scannable)"
            >
              <PlaceholderQrCanvas seed={qrSeed} />
            </div>

            <div className="relative z-[1] flex items-center justify-between rounded-[9px] border border-white/10 bg-white/[0.08] px-3.5 py-2.5">
              <span className="text-xs text-white/[0.55]">Staff Discount</span>
              <span className="font-authSerif text-xl">{discountDisplay}</span>
            </div>

            <div className="relative z-[1] mt-2.5 text-right text-[11px] text-white/30">
              QR refreshes in <span className="tabular-nums">{mockCountdown}</span>
            </div>
          </div>

          <div className="mt-3.5 flex gap-2">
            <button type="button" disabled={refreshing} onClick={onRefresh} className={ghostBtn}>
              {refreshing ? 'Refreshing...' : 'Refresh QR'}
            </button>
            {canScan ? (
              <Link href="/discount/scan" className={ghostBtn}>
                Scan a Card
              </Link>
            ) : null}
          </div>

          <p className="mt-3 text-center text-[11px] text-[#6b6b6b] sm:text-left">
            Placeholder QR (visual only). Backend token generation has been removed for now.
          </p>
          <p className="mt-1 text-center text-[11px] text-[#6b6b6b] sm:text-left">
            Countdown is a demo timer for the frontend preview only.
          </p>
        </div>

        <div className="min-w-[260px] flex-1">
          <div className="mb-3.5">
            <h2 className="font-authSerif text-lg tracking-tight text-[#121212]">Discount Tiers</h2>
          </div>

          {tierLoading ? (
            <p className="text-sm text-[#6b6b6b]">Loading tiers...</p>
          ) : !tierConfigured ? (
            <div className="mb-5 rounded-xl border border-amber-500/35 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              No discount configured for your role. Contact your admin.
            </div>
          ) : null}

          <div className="mb-5 overflow-hidden rounded-xl border border-[#d8d8d8] bg-white">
            {sortedTiers.length === 0 ? (
              <div className="px-[18px] py-4 text-sm text-[#6b6b6b]">No tiers configured for your organisation.</div>
            ) : (
              sortedTiers.map((t) => {
                const current = t.role === profile.role;
                return (
                  <div
                    key={t.id}
                    className={[
                      'flex items-center justify-between gap-3 border-b border-[#d8d8d8] px-[18px] py-[13px] last:border-b-0',
                      current ? 'bg-[#f5f4f1]' : '',
                    ].join(' ')}
                  >
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-medium text-[#121212]">{t.label}</div>
                      {current ? (
                        <div className="mt-0.5 text-xs text-[#9b9b9b]">Your current tier</div>
                      ) : null}
                      {t.valid_at ? (
                        <div className="mt-0.5 text-xs text-[#9b9b9b]">Valid at: {t.valid_at}</div>
                      ) : null}
                    </div>
                    <div className="shrink-0 font-authSerif text-[17px] text-[#166534]">
                      {t.discount_value?.trim() || '-'}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="rounded-xl border border-[#d8d8d8] bg-white px-[18px] py-[18px]">
            <div className="text-[13.5px] font-medium text-[#121212]">How it works</div>
            <div className="mt-1.5 text-[13px] leading-[1.7] text-[#6b6b6b]">
              Show your QR code at participating venues. This page currently keeps the card UI and demo scanner
              experience only while the verification backend is disabled.
              <br />
              <br />
              Your discount tier is still based on your current role.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
