'use client';

import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

export type ScanLogRow = {
  id: string;
  created_at: string;
  token_valid: boolean;
  error_code: string | null;
  scanned_display_name: string | null;
  scanned_role: string | null;
  scanned_department: string | null;
  discount_label_snapshot: string | null;
  scanner_id: string;
  scanner: { full_name: string } | { full_name: string }[] | null;
};

function firstScanner(
  v: { full_name: string } | { full_name: string }[] | null | undefined
): string {
  if (!v) return 'Scanner';
  if (Array.isArray(v)) return v[0]?.full_name ?? 'Scanner';
  return v.full_name;
}

type ResultFilter = 'all' | 'valid' | 'invalid';
type PeriodFilter = '7' | '30' | '90' | 'all';

function periodStart(p: PeriodFilter): Date | null {
  if (p === 'all') return null;
  const d = new Date();
  const days = p === '7' ? 7 : p === '30' ? 30 : 90;
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function ScanLogsClient({ initialRows }: { initialRows: ScanLogRow[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<ScanLogRow[]>(initialRows);
  const [q, setQ] = useState('');
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [period, setPeriod] = useState<PeriodFilter>('30');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  const refresh = useCallback(async () => {
    setBusy(true);
    const { data, error } = await supabase
      .from('scan_logs')
      .select(
        `id, created_at, token_valid, error_code, scanned_display_name, scanned_role, scanned_department, discount_label_snapshot, scanner_id,
         scanner:profiles!scan_logs_scanner_id_fkey(full_name)`
      )
      .order('created_at', { ascending: false })
      .limit(500);
    if (!error && data) setRows(data as ScanLogRow[]);
    setBusy(false);
  }, [supabase]);

  const filtered = useMemo(() => {
    const qn = q.trim().toLowerCase();
    const cutoff = periodStart(period);
    return rows.filter((r) => {
      if (cutoff && new Date(r.created_at) < cutoff) return false;
      if (resultFilter === 'valid' && !r.token_valid) return false;
      if (resultFilter === 'invalid' && r.token_valid) return false;
      if (!qn) return true;
      const scanner = firstScanner(r.scanner).toLowerCase();
      const hay = [
        scanner,
        (r.scanned_display_name ?? '').toLowerCase(),
        (r.scanned_role ?? '').toLowerCase(),
        (r.scanned_department ?? '').toLowerCase(),
        (r.discount_label_snapshot ?? '').toLowerCase(),
        (r.error_code ?? '').toLowerCase(),
      ].join(' ');
      return hay.includes(qn);
    });
  }, [rows, q, resultFilter, period]);

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-7">
      <div className="mb-6">
        <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">Activity log</h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          Audit trail of staff discount QR verification attempts in your organisation.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex h-9 w-full max-w-[240px] items-center gap-2 rounded-lg border border-[#d8d8d8] bg-[#f5f4f1] px-3">
          <span className="text-[13px] text-[#9b9b9b]" aria-hidden>
            🔍
          </span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, role, dept, code..."
            className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[#121212] outline-none placeholder:text-[#9b9b9b]"
            aria-label="Search scan logs"
          />
        </div>
        <select
          className="h-9 rounded-lg border border-[#d8d8d8] bg-white px-2.5 text-[13px] text-[#121212] outline-none"
          value={resultFilter}
          onChange={(e) => setResultFilter(e.target.value as ResultFilter)}
          aria-label="Filter by result"
        >
          <option value="all">All results</option>
          <option value="valid">Valid only</option>
          <option value="invalid">Invalid only</option>
        </select>
        <select
          className="h-9 rounded-lg border border-[#d8d8d8] bg-white px-2.5 text-[13px] text-[#121212] outline-none"
          value={period}
          onChange={(e) => setPeriod(e.target.value as PeriodFilter)}
          aria-label="Time range"
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="all">All loaded</option>
        </select>
        <button
          type="button"
          disabled={busy}
          onClick={() => void refresh()}
          className="h-9 rounded-lg border border-[#d8d8d8] bg-white px-3 text-[13px] font-medium text-[#6b6b6b] hover:bg-[#f5f4f1] disabled:opacity-50"
        >
          {busy ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <p className="mb-3 text-[12px] text-[#9b9b9b]">
        Showing up to 500 most recent entries. Narrow the date range to focus recent activity.
      </p>

      <div className="overflow-hidden rounded-xl border border-[#d8d8d8] bg-white">
        <div className="px-1.5 py-1">
          {filtered.length === 0 ? (
            <p className="px-4 py-12 text-center text-[13px] text-[#9b9b9b]">
              {rows.length === 0 ? 'No scans recorded yet.' : 'No entries match your filters.'}
            </p>
          ) : (
            filtered.map((r) => {
              const scanner = firstScanner(r.scanner);
              const staff = r.scanned_display_name ?? 'Unknown member';
              const role = r.scanned_role?.replace(/_/g, ' ') ?? null;
              const meta = [role, r.scanned_department, r.discount_label_snapshot].filter(Boolean).join(' · ');
              const when = new Date(r.created_at).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              });

              return (
                <div key={r.id} className="flex gap-3 border-b border-[#d8d8d8] px-3.5 py-3.5 last:border-0">
                  <div
                    className={[
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[14px]',
                      r.token_valid
                        ? 'border-[#bbf7d0] bg-[#dcfce7] text-[#166534]'
                        : 'border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]',
                    ].join(' ')}
                    aria-hidden
                  >
                    {r.token_valid ? '✓' : '✕'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-snug text-[#6b6b6b]">
                      <span className="font-medium text-[#121212]">{scanner}</span> verified{' '}
                      <span className="font-medium text-[#121212]">{staff}</span>
                      {r.token_valid ? (
                        <span className="text-[#15803d]"> - valid token</span>
                      ) : (
                        <span className="text-[#b91c1c]">
                          {' '}
                          - failed{r.error_code ? ` (${r.error_code})` : ''}
                        </span>
                      )}
                    </p>
                    {meta ? <p className="mt-1 text-[12px] text-[#9b9b9b]">{meta}</p> : null}
                    <p className="mt-1 text-[11px] text-[#9b9b9b]">{when}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-4 text-[13px]">
        <Link href="/admin/discount" className="font-medium text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]">
          Discount rules
        </Link>
        <Link href="/discount/scan" className="font-medium text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]">
          Open staff scanner
        </Link>
      </div>
    </div>
  );
}
