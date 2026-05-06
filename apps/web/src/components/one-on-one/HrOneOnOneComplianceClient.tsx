'use client';

import { useMemo, useState } from 'react';

import { createClient } from '@/lib/supabase/client';

export type ComplianceRow = {
  report_user_id: string;
  report_name: string;
  manager_user_id: string;
  manager_name: string;
  last_completed_at: string | null;
  next_due_on: string;
  cadence_days: number;
  status: string;
  days_overdue: number;
};

export function HrOneOnOneComplianceClient({ initialRows }: { initialRows: ComplianceRow[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [filter, setFilter] = useState<'all' | 'overdue' | 'due_soon' | 'ok'>('all');
  const [rows, setRows] = useState(initialRows);
  const [loading, setLoading] = useState(false);
  const overview = useMemo(() => {
    const total = rows.length;
    const overdue = rows.filter((row) => row.status === 'overdue').length;
    const dueSoon = rows.filter((row) => row.status === 'due_soon').length;
    const onTrack = rows.filter((row) => row.status === 'ok').length;
    const averageCadenceDays = total > 0 ? Math.round(rows.reduce((sum, row) => sum + row.cadence_days, 0) / total) : 0;

    return {
      total,
      overdue,
      dueSoon,
      onTrack,
      averageCadenceDays,
    };
  }, [rows]);

  const load = async (f: typeof filter) => {
    setLoading(true);
    const { data, error } = await supabase.rpc('hr_one_on_one_compliance_list', { p_filter: f });
    setLoading(false);
    if (!error && Array.isArray(data)) setRows(data as ComplianceRow[]);
  };

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-7">
      <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">1:1 check-in oversight</h1>
      <p className="mt-1 text-[13px] text-[#6b6b6b]">Manager–report pairs, cadence, and compliance status.</p>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <OverviewCard label="Total pairs" value={overview.total} />
        <OverviewCard label="Overdue" value={overview.overdue} tone="danger" />
        <OverviewCard label="Due soon" value={overview.dueSoon} tone="warning" />
        <OverviewCard label="On track" value={overview.onTrack} tone="success" />
        <OverviewCard label="Avg cadence" value={`${overview.averageCadenceDays}d`} />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {(['all', 'overdue', 'due_soon', 'ok'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => {
              setFilter(f);
              void load(f);
            }}
            className={[
              'rounded-full px-3 py-1.5 text-[12px] font-medium',
              filter === f ? 'bg-[#121212] text-[#faf9f6]' : 'border border-[#d8d8d8] bg-white text-[#4a4a4a]',
            ].join(' ')}
          >
            {f === 'all' ? 'All' : f === 'due_soon' ? 'Due soon' : f}
          </button>
        ))}
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-[#e8e8e8] bg-white">
        <table className="min-w-full text-left text-[13px]">
          <thead className="border-b border-[#ececec] bg-[#faf9f6] text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
            <tr>
              <th className="px-4 py-3">Report</th>
              <th className="px-4 py-3">Manager</th>
              <th className="px-4 py-3">Last 1:1</th>
              <th className="px-4 py-3">Next due</th>
              <th className="px-4 py-3">Cadence (d)</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Days overdue</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[#6b6b6b]">
                  Loading…
                </td>
              </tr>
            ) : null}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[#6b6b6b]">
                  No pairs to show.
                </td>
              </tr>
            ) : null}
            {!loading &&
              rows.map((r) => (
                <tr key={`${r.manager_user_id}-${r.report_user_id}`} className="border-b border-[#f0f0f0]">
                  <td className="px-4 py-3 font-medium text-[#121212]">{r.report_name}</td>
                  <td className="px-4 py-3 text-[#4a4a4a]">{r.manager_name}</td>
                  <td className="px-4 py-3 text-[#6b6b6b]">
                    {r.last_completed_at
                      ? new Date(r.last_completed_at).toLocaleDateString()
                      : ''}
                  </td>
                  <td className="px-4 py-3 text-[#6b6b6b]">{new Date(r.next_due_on).toLocaleDateString()}</td>
                  <td className="px-4 py-3">{r.cadence_days}</td>
                  <td className="px-4 py-3">
                    <span
                      className={[
                        'rounded-full px-2 py-0.5 text-[11px] font-medium',
                        r.status === 'overdue'
                          ? 'bg-[#fef2f2] text-[#b91c1c]'
                          : r.status === 'due_soon'
                            ? 'bg-[#fffbeb] text-[#b45309]'
                            : 'bg-[#dcfce7] text-[#166534]',
                      ].join(' ')}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{r.days_overdue > 0 ? r.days_overdue : ''}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OverviewCard({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number | string;
  tone?: 'neutral' | 'danger' | 'warning' | 'success';
}) {
  const toneClasses =
    tone === 'danger'
      ? 'border-[#fecaca]'
      : tone === 'warning'
        ? 'border-[#fde68a]'
        : tone === 'success'
          ? 'border-[#bbf7d0]'
          : 'border-[#e8e8e8]';

  return (
    <div className={`rounded-xl border bg-white p-4 ${toneClasses}`}>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">{label}</p>
      <p className="mt-2 text-[28px] font-semibold leading-none text-[#121212] tabular-nums">{value}</p>
    </div>
  );
}
