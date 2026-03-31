'use client';

import { PROFILE_ROLES, type ProfileRole } from '@campsite/types';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

type TierRow = {
  id: string;
  role: ProfileRole;
  label: string;
  discount_value: string | null;
  valid_at: string | null;
};

type Draft = {
  id?: string;
  percent: number;
  label: string;
  validAt: string;
};

const ROLE_LABEL: Record<string, string> = {
  org_admin: 'Org admin',
  manager: 'Manager',
  coordinator: 'Coordinator',
  administrator: 'Administrator',
  duty_manager: 'Duty manager',
  csa: 'CSA',
  society_leader: 'Society leader',
};

function roleBadgeClass(role: string): string {
  const m: Record<string, string> = {
    org_admin: 'bg-[#1a1a1a] text-[#faf9f6]',
    manager: 'bg-[#14532d] text-[#86efac]',
    coordinator: 'bg-[#3b0764] text-[#d8b4fe]',
    administrator: 'bg-[#431407] text-[#fdba74]',
    duty_manager: 'bg-[#292524] text-[#e7e5e4]',
    csa: 'border border-[#d8d8d8] bg-[#f5f4f1] text-[#6b6b6b]',
    society_leader: 'bg-[#fef3c7] text-[#92400e]',
  };
  return m[role] ?? 'border border-[#d8d8d8] bg-[#f5f4f1] text-[#6b6b6b]';
}

function parsePercent(v: string | null | undefined): number {
  if (!v) return 0;
  const m = v.trim().match(/^(\d+)/);
  return m ? Math.min(100, Math.max(0, parseInt(m[1]!, 10))) : 0;
}

function emptyDraft(): Draft {
  return { percent: 0, label: '', validAt: '' };
}

function tiersToDraftMap(tiers: TierRow[]): Record<ProfileRole, Draft> {
  const map = {} as Record<ProfileRole, Draft>;
  for (const r of PROFILE_ROLES) {
    const t = tiers.find((x) => x.role === r);
    if (t) {
      map[r] = {
        id: t.id,
        percent: parsePercent(t.discount_value),
        label: t.label,
        validAt: t.valid_at ?? '',
      };
    } else {
      map[r] = emptyDraft();
    }
  }
  return map;
}

export function AdminDiscountRulesClient({
  orgId,
  initialTiers,
}: {
  orgId: string;
  initialTiers: TierRow[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [draft, setDraft] = useState<Record<ProfileRole, Draft>>(() => tiersToDraftMap(initialTiers));
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(tiersToDraftMap(initialTiers));
  }, [initialTiers]);

  const setRoleDraft = useCallback((role: ProfileRole, patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, [role]: { ...d[role]!, ...patch } }));
  }, []);

  const saveAll = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      for (const role of PROFILE_ROLES) {
        const row = draft[role]!;
        let pct = Math.round(Number(row.percent));
        if (!Number.isFinite(pct)) pct = 0;
        pct = Math.min(100, Math.max(0, pct));
        if (pct <= 0) {
          if (row.id) {
            const { error } = await supabase.from('discount_tiers').delete().eq('id', row.id);
            if (error) {
              setMsg(error.message);
              return;
            }
          }
          continue;
        }
        const label = row.label.trim() || `${pct}% staff discount`;
        const discount_value = `${pct}%`;
        const valid_at = row.validAt.trim() || null;
        if (row.id) {
          const { error } = await supabase
            .from('discount_tiers')
            .update({ label, discount_value, valid_at })
            .eq('id', row.id);
          if (error) {
            setMsg(error.message);
            return;
          }
        } else {
          const { error } = await supabase.from('discount_tiers').insert({
            org_id: orgId,
            role,
            label,
            discount_value,
            valid_at,
          });
          if (error) {
            setMsg(error.message);
            return;
          }
        }
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }, [draft, orgId, router, supabase]);

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-7">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">
            Discount rules
          </h1>
          <p className="mt-1 text-[13px] text-[#6b6b6b]">
            Configure staff discount tiers by role. Changes apply immediately to all discount cards.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveAll()}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-[#121212] px-4 text-[13px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Saving...' : 'Save changes'}
        </button>
      </div>

      <div className="mb-5 flex gap-3 rounded-lg border border-[#d6d3d1] bg-[#f5f5f4] px-4 py-3 text-[13px] text-[#44403c]">
        <span className="shrink-0" aria-hidden>
          ℹ️
        </span>
        <span>
          Discount values are informational only - no payment processing. Staff show their QR code to cashiers who
          verify via the app.
        </span>
      </div>

      {msg ? <p className="mb-4 text-sm text-[#b91c1c]">{msg}</p> : null}

      <div className="max-w-[560px] rounded-xl border border-[#d8d8d8] bg-white">
        <div className="divide-y divide-[#d8d8d8] px-5 py-1">
          {PROFILE_ROLES.map((role) => {
            const row = draft[role]!;
            return (
              <div key={role} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <span
                  className={[
                    'inline-flex min-w-[150px] shrink-0 items-center justify-center rounded-full px-3 py-1 text-[11px] font-semibold',
                    roleBadgeClass(role),
                  ].join(' ')}
                >
                  {ROLE_LABEL[role] ?? role.replace(/_/g, ' ')}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:items-end">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={row.percent}
                      onChange={(e) => {
                        const v = e.target.value;
                        const n = v === '' ? 0 : Number(v);
                        setRoleDraft(role, { percent: Number.isFinite(n) ? n : 0 });
                      }}
                      className="w-[72px] rounded-lg border border-[#d8d8d8] bg-white px-2.5 py-2 text-center text-[13.5px] text-[#121212] outline-none focus:border-[#121212]"
                      aria-label={`${ROLE_LABEL[role]} percent off`}
                    />
                    <span className="text-[13px] text-[#6b6b6b]">% off</span>
                  </div>
                  <label className="flex w-full max-w-md flex-col gap-1 sm:items-end">
                    <span className="text-[11px] text-[#9b9b9b]">Card label (optional)</span>
                    <input
                      type="text"
                      value={row.label}
                      onChange={(e) => setRoleDraft(role, { label: e.target.value })}
                      placeholder="Shown on member discount card"
                      className="w-full rounded-lg border border-[#d8d8d8] bg-[#f5f4f1] px-2.5 py-1.5 text-[12.5px] text-[#121212] outline-none sm:text-right"
                    />
                  </label>
                  <label className="flex w-full max-w-md flex-col gap-1 sm:items-end">
                    <span className="text-[11px] text-[#9b9b9b]">Valid at (optional)</span>
                    <input
                      type="text"
                      value={row.validAt}
                      onChange={(e) => setRoleDraft(role, { validAt: e.target.value })}
                      placeholder="e.g. All venues"
                      className="w-full rounded-lg border border-[#d8d8d8] bg-[#f5f4f1] px-2.5 py-1.5 text-[12.5px] text-[#121212] outline-none sm:text-right"
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-4 text-[13px]">
        <Link
          href="/admin/scan-logs"
          className="font-medium text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]"
        >
          View scan logs →
        </Link>
        <Link href="/discount/scan" className="font-medium text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]">
          Open staff scanner
        </Link>
        <Link
          href="/settings/discount-tiers"
          className="font-medium text-[#9b9b9b] underline underline-offset-2 hover:text-[#6b6b6b]"
        >
          Legacy settings view
        </Link>
      </div>
    </div>
  );
}
