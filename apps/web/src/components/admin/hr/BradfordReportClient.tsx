'use client';

import { useShellRefresh } from '@/hooks/useShellRefresh';
import { createClient } from '@/lib/supabase/client';
import { getDisplayName } from '@/lib/names';
import Link from 'next/link';
import { AlertTriangle, Download, RefreshCw } from 'lucide-react';
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

type LeaveTrendRow = {
  month_key: string;
  leave_days: number;
  sickness_days: number;
  leave_request_count: number;
};

type HighAbsenceRow = {
  user_id: string;
  full_name: string;
  preferred_name: string | null;
  reports_to_name: string | null;
  spell_count: number;
  total_days: number;
  bradford_score: number;
  trigger_reason: string;
};

export function BradfordReportClient({
  initialRows,
  initialAsOf,
  bradfordWindowDays,
  canViewAll,
  initialTrends,
  initialHighAbsence,
}: {
  initialRows: BradfordReportRow[];
  initialAsOf: string;
  bradfordWindowDays: number;
  /** When false, roster is direct reports only (manager view). */
  canViewAll: boolean;
  initialTrends: LeaveTrendRow[];
  initialHighAbsence: HighAbsenceRow[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [asOf, setAsOf] = useState(initialAsOf);
  const [rows, setRows] = useState(initialRows);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [alertsOnly, setAlertsOnly] = useState(false);
  const [trends, setTrends] = useState<LeaveTrendRow[]>(initialTrends);
  const [highAbsence, setHighAbsence] = useState<HighAbsenceRow[]>(initialHighAbsence);

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
    const [{ data: trendData }, { data: highAbsenceData }] = await Promise.all([
      supabase.rpc('hr_leave_usage_trends', { p_on: asOf }),
      supabase.rpc('hr_high_absence_triggers', { p_on: asOf }),
    ]);
    setTrends(((trendData ?? []) as LeaveTrendRow[]).map((r) => ({
      ...r,
      leave_days: Number(r.leave_days),
      sickness_days: Number(r.sickness_days),
      leave_request_count: Number(r.leave_request_count),
    })));
    setHighAbsence(((highAbsenceData ?? []) as HighAbsenceRow[]).map((r) => ({
      ...r,
      spell_count: Number(r.spell_count),
      total_days: Number(r.total_days),
      bradford_score: Number(r.bradford_score),
    })));
  }, [supabase, asOf]);

  useShellRefresh(() => void load({ silent: true }));

  const visible = useMemo(() => {
    if (!alertsOnly) return rows;
    return rows.filter((r) => r.bradford_score >= ALERT_THRESHOLD);
  }, [rows, alertsOnly]);

  const exportCsv = useCallback(() => {
    const header = ['Employee', 'Manager', 'Spells', 'Total absence days', 'Bradford score'];
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
    <div className="w-full px-5 py-6 sm:px-[28px] sm:py-7">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-authSerif text-[28px] leading-tight tracking-[-0.03em] text-[#121212]">Absence reporting</h1>
          <p className="mt-1 max-w-xl text-[13.5px] text-[#6b6b6b]">
            Bradford factor (S² × D) from sickness and leave episodes in the rolling window ({bradfordWindowDays} days). Overlapping or
            back-to-back absences count as one spell. Common UK guidance treats scores around {ALERT_THRESHOLD}+ as a review trigger.
          </p>
          {!canViewAll ? (
            <p className="mt-2 text-[12.5px] text-[#6b6b6b]">Showing your direct reports only.</p>
          ) : null}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 rounded-xl border border-[#d8d8d8] bg-white p-4 md:grid-cols-[auto_auto_1fr_auto] md:items-end">
        <label className="flex flex-col gap-1 text-[12px] text-[#6b6b6b]">
          As of
          <input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="h-10 rounded-lg border border-[#d8d8d8] bg-white px-3 text-[13px] text-[#121212] focus:border-[#121212] focus:outline-none"
          />
        </label>
        <button
          type="button"
          disabled={busy || !asOf}
          onClick={() => void load()}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#d8d8d8] bg-white px-4 text-[13px] font-medium text-[#121212] hover:bg-[#f5f4f1] disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          {busy ? 'Loading…' : 'Apply'}
        </button>
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-[#d8d8d8] bg-white px-3 text-[12px] text-[#6b6b6b] md:justify-center">
          <input type="checkbox" checked={alertsOnly} onChange={(e) => setAlertsOnly(e.target.checked)} className="rounded border-[#d8d8d8]" />
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          Alerts only (≥{ALERT_THRESHOLD})
        </label>
        <button
          type="button"
          onClick={exportCsv}
          disabled={!visible.length}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#121212] px-4 text-[13px] font-medium text-white disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          Export CSV
        </button>
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
                    <td className="px-4 py-3 text-[#4a4a4a]">{r.reports_to_name ?? ''}</td>
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

      <section className="mt-6 rounded-xl border border-[#d8d8d8] bg-white p-4">
        <h2 className="text-[13px] font-semibold text-[#121212]">Leave usage trends (last 6 months)</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {trends.map((t) => (
            <div key={t.month_key} className="rounded-lg border border-[#ececec] bg-[#faf9f6] p-3">
              <p className="text-[12px] font-medium text-[#121212]">{t.month_key}</p>
              <p className="mt-1 text-[12px] text-[#6b6b6b]">Leave days: {t.leave_days}</p>
              <p className="text-[12px] text-[#6b6b6b]">Sickness days: {t.sickness_days}</p>
              <p className="text-[12px] text-[#6b6b6b]">Leave requests: {t.leave_request_count}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-[#d8d8d8] bg-white p-4">
        <h2 className="text-[13px] font-semibold text-[#121212]">High absence employees (auto triggers)</h2>
        {highAbsence.length === 0 ? (
          <p className="mt-2 text-[12px] text-[#9b9b9b]">No trigger conditions met for the selected date.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-[#ececec] text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Manager</th>
                  <th className="px-3 py-2">Spells</th>
                  <th className="px-3 py-2">Days</th>
                  <th className="px-3 py-2">Bradford</th>
                  <th className="px-3 py-2">Trigger</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ececec]">
                {highAbsence.map((h) => (
                  <tr key={h.user_id}>
                    <td className="px-3 py-2">
                      <Link href={`/hr/records/${h.user_id}`} className="font-medium text-[#121212] underline-offset-2 hover:underline">
                        {getDisplayName(h.full_name, h.preferred_name)}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-[#4a4a4a]">{h.reports_to_name ?? ''}</td>
                    <td className="px-3 py-2 tabular-nums">{h.spell_count}</td>
                    <td className="px-3 py-2 tabular-nums">{h.total_days}</td>
                    <td className="px-3 py-2 tabular-nums font-semibold text-[#b91c1c]">{h.bradford_score}</td>
                    <td className="px-3 py-2 text-[#6b6b6b]">{h.trigger_reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function csvCell(s: string) {
  const t = s.replace(/"/g, '""');
  if (/[",\n]/.test(t)) return `"${t}"`;
  return t;
}
