'use client';

import { useShellRefresh } from '@/hooks/useShellRefresh';
import { createClient } from '@/lib/supabase/client';
import { getDisplayName } from '@/lib/names';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';

const ALERT_THRESHOLD = 200;

export type BradfordReportRow = {
  user_id: string;
  full_name: string;
  preferred_name: string | null;
  reports_to_user_id: string | null;
  reports_to_name: string | null;
  spell_count: number;
  total_days: number;
  bradford_score: number;
};

export function BradfordReportClient({
  initialRows,
  initialAsOf,
  bradfordWindowDays,
  canViewAll,
}: {
  initialRows: BradfordReportRow[];
  initialAsOf: string;
  bradfordWindowDays: number;
  /** When false, roster is direct reports only (manager view). */
  canViewAll: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [asOf, setAsOf] = useState(initialAsOf);
  const [rows, setRows] = useState(initialRows);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [alertsOnly, setAlertsOnly] = useState(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) {
      setBusy(true);
      setErr(null);
    }
    const { data, error } = await supabase.rpc('hr_bradford_report', { p_on: asOf });
    if (!silent) setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    const list = (data ?? []) as BradfordReportRow[];
    setRows(
      list.map((r) => ({
        ...r,
        spell_count: Number(r.spell_count),
        total_days: Number(r.total_days),
        bradford_score: Number(r.bradford_score),
      })),
    );
  }, [supabase, asOf]);

  useShellRefresh(() => void load({ silent: true }));

  const visible = useMemo(() => {
    if (!alertsOnly) return rows;
    return rows.filter((r) => r.bradford_score >= ALERT_THRESHOLD);
  }, [rows, alertsOnly]);

  const exportCsv = useCallback(() => {
    const header = ['Employee', 'Manager', 'Spells', 'Total sick days', 'Bradford score'];
    const lines = [
      header.join(','),
      ...visible.map((r) => {
        const name = getDisplayName(r.full_name, r.preferred_name);
        const mgr = r.reports_to_name ?? '';
        return [csvCell(name), csvCell(mgr), String(r.spell_count), String(r.total_days), String(r.bradford_score)].join(',');
      }),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bradford-absence-${asOf}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [visible, asOf]);

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-7">
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-authSerif text-[28px] leading-tight tracking-[-0.03em] text-[#121212]">Absence reporting</h1>
          <p className="mt-1 max-w-xl text-[13.5px] text-[#6b6b6b]">
            Bradford factor (S² × D) from sickness episodes in the rolling window ({bradfordWindowDays} days). Overlapping or
            back-to-back absences count as one spell. Common UK guidance treats scores around {ALERT_THRESHOLD}+ as a review trigger.
          </p>
          {!canViewAll ? (
            <p className="mt-2 text-[12.5px] text-[#6b6b6b]">Showing your direct reports only.</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[12px] text-[#6b6b6b]">
            As of
            <input
              type="date"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
              className="rounded-lg border border-[#d8d8d8] bg-white px-2 py-1.5 text-[13px] text-[#121212] focus:border-[#121212] focus:outline-none"
            />
          </label>
          <button
            type="button"
            disabled={busy || !asOf}
            onClick={() => void load()}
            className="inline-flex h-9 items-center rounded-lg border border-[#d8d8d8] bg-white px-3 text-[12px] font-medium text-[#121212] hover:bg-[#f5f4f1] disabled:opacity-50"
          >
            {busy ? 'Loading…' : 'Apply'}
          </button>
          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[#6b6b6b]">
            <input type="checkbox" checked={alertsOnly} onChange={(e) => setAlertsOnly(e.target.checked)} className="rounded border-[#d8d8d8]" />
            Alerts only (≥{ALERT_THRESHOLD})
          </label>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!visible.length}
            className="inline-flex h-9 items-center rounded-lg bg-[#121212] px-3 text-[12px] font-medium text-white disabled:opacity-50"
          >
            Export CSV
          </button>
        </div>
      </div>

      {err ? (
        <div className="mb-4 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[13px] text-[#b91c1c]">{err}</div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-[#d8d8d8] bg-white">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-[#ececec] text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Reports to</th>
              <th className="px-4 py-3">Spells</th>
              <th className="px-4 py-3">Sick days</th>
              <th className="px-4 py-3">Bradford</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#ececec]">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[#9b9b9b]">
                  {alertsOnly ? 'No one at or above the alert threshold.' : 'No employees in scope.'}
                </td>
              </tr>
            ) : (
              visible.map((r) => {
                const warn = r.bradford_score >= ALERT_THRESHOLD;
                return (
                  <tr key={r.user_id} className={warn ? 'bg-[#fffafa]' : undefined}>
                    <td className="px-4 py-3">
                      <Link href={`/hr/records/${r.user_id}`} className="font-medium text-[#121212] underline-offset-2 hover:underline">
                        {getDisplayName(r.full_name, r.preferred_name)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[#4a4a4a]">{r.reports_to_name ?? '—'}</td>
                    <td className="px-4 py-3 tabular-nums">{r.spell_count}</td>
                    <td className="px-4 py-3 tabular-nums">{r.total_days}</td>
                    <td className="px-4 py-3">
                      <span className={['tabular-nums font-semibold', warn ? 'text-[#b91c1c]' : 'text-[#121212]'].join(' ')}>
                        {r.bradford_score}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function csvCell(s: string) {
  const t = s.replace(/"/g, '""');
  if (/[",\n]/.test(t)) return `"${t}"`;
  return t;
}
