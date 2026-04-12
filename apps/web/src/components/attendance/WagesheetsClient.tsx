'use client';

import { createClient } from '@/lib/supabase/client';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Line = {
  id: string;
  user_id: string;
  week_start_date: string;
  line_type: string;
  description: string | null;
  hours: number | null;
  hourly_rate_gbp: number | null;
  amount_gbp: number;
};

export function WagesheetsClient({ orgId }: { orgId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [lines, setLines] = useState<Line[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [weekFilter, setWeekFilter] = useState('');

  const load = useCallback(async () => {
    setErr(null);
    let q = supabase
      .from('wagesheet_lines')
      .select('id, user_id, week_start_date, line_type, description, hours, hourly_rate_gbp, amount_gbp')
      .eq('org_id', orgId)
      .order('week_start_date', { ascending: false })
      .limit(200);
    if (weekFilter) q = q.eq('week_start_date', weekFilter);
    const { data, error } = await q;
    if (error) {
      setErr(error.message);
      return;
    }
    setLines((data as Line[]) ?? []);
  }, [orgId, supabase, weekFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  function exportCsv() {
    const header = ['user_id', 'week_start', 'line_type', 'hours', 'rate', 'amount_gbp', 'description'];
    const esc = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = lines.map(
      (l) =>
        [l.user_id, l.week_start_date, l.line_type, l.hours ?? '', l.hourly_rate_gbp ?? '', l.amount_gbp, l.description ?? ''].map(esc).join(','),
    );
    const blob = new Blob([[header.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `wagesheets-${orgId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-4">
      {err ? <p className="text-[13px] text-red-700">{err}</p> : null}
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-[12px] text-[#6b6b6b]">
          Week start (optional filter)
          <input
            type="date"
            value={weekFilter}
            onChange={(e) => setWeekFilter(e.target.value)}
            className="ml-2 rounded border border-[#d8d8d8] px-2 py-1 text-[13px]"
          />
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-[#d8d8d8] px-3 py-1.5 text-[12.5px]"
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={exportCsv}
          className="rounded-lg bg-[#121212] px-3 py-1.5 text-[12.5px] text-white"
        >
          Export CSV
        </button>
      </div>
      <p className="text-[12px] text-[#6b6b6b]">
        Indicative figures. SSP lines use the same HMRC-style estimate as leave; verify with payroll before paying.
      </p>
      <div className="overflow-x-auto rounded-xl border border-[#e8e4dc]">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead className="border-b border-[#e8e4dc] bg-[#faf9f6] text-[11px] uppercase tracking-wide text-[#9b9b9b]">
            <tr>
              <th className="px-3 py-2">Employee</th>
              <th className="px-3 py-2">Week</th>
              <th className="px-3 py-2">Line</th>
              <th className="px-3 py-2">Hours</th>
              <th className="px-3 py-2">Rate</th>
              <th className="px-3 py-2">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-[#6b6b6b]">
                  No wagesheet lines yet (approve a timesheet first).
                </td>
              </tr>
            ) : (
              lines.map((l) => (
                <tr key={l.id} className="border-b border-[#f0f0f0]">
                  <td className="px-3 py-2 font-mono text-[12px]">{l.user_id.slice(0, 8)}…</td>
                  <td className="px-3 py-2">{l.week_start_date}</td>
                  <td className="px-3 py-2 capitalize">{l.line_type.replace('_', ' ')}</td>
                  <td className="px-3 py-2">{l.hours != null ? l.hours : '—'}</td>
                  <td className="px-3 py-2">{l.hourly_rate_gbp != null ? `£${l.hourly_rate_gbp}` : '—'}</td>
                  <td className="px-3 py-2 font-medium">£{Number(l.amount_gbp).toFixed(2)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
