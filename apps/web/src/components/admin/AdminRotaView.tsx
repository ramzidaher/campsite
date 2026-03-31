import Link from 'next/link';

import type { AdminRotaDashboardModel } from '@/lib/admin/loadAdminRota';

function fmtShiftTime(startIso: string, endIso: string) {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const opt: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  return `${s.toLocaleTimeString(undefined, opt)}-${e.toLocaleTimeString(undefined, opt)}`;
}

function fmtShiftDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function StatCard({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-[#d8d8d8] bg-white px-5 py-[18px]">
      <div className="mb-2 text-[11.5px] font-medium uppercase tracking-[0.06em] text-[#9b9b9b]">{label}</div>
      <div className={`font-authSerif text-[28px] leading-none tracking-tight text-[#121212] ${valueClass ?? ''}`}>
        {value}
      </div>
      <div className="mt-2 text-xs text-[#9b9b9b]">{sub}</div>
    </div>
  );
}

/** Rota management under `/admin/rota` - only org admins reach this view (`admin/layout.tsx`). */
export function AdminRotaView({ data }: { data: AdminRotaDashboardModel }) {
  const coverage =
    data.coveragePct != null ? `${data.coveragePct}%` : '-';
  const coverageSub =
    data.shiftsThisWeek > 0
      ? `${data.unfilledThisWeek} unfilled slot${data.unfilledThisWeek === 1 ? '' : 's'}`
      : 'No shifts scheduled this week';

  const syncTitle = data.lastSyncLabel ?? 'No imports yet';
  const syncSub = data.lastSyncSub ?? 'Run a sync from the Sheets import wizard';

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-7">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">
            Rota management
          </h1>
          <p className="mt-1 text-[13px] text-[#6b6b6b]">
            Import, edit and manage working schedules for all departments.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/rota-import"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-[#d8d8d8] bg-white px-4 text-[13px] font-medium text-[#6b6b6b] transition-colors hover:bg-[#f5f4f1]"
          >
            📥 Import Google Sheets
          </Link>
          <Link
            href="/rota"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-[#121212] px-4 text-[13px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90"
          >
            + Add shift
          </Link>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <StatCard
          label="📊 Shifts this week"
          value={String(data.shiftsThisWeek)}
          sub={
            data.deptCountThisWeek > 0
              ? `Across ${data.deptCountThisWeek} department${data.deptCountThisWeek === 1 ? '' : 's'}`
              : 'No department tags on shifts'
          }
        />
        <StatCard
          label="✅ Coverage rate"
          value={coverage}
          sub={coverageSub}
          valueClass={data.coveragePct != null && data.coveragePct >= 90 ? 'text-[#15803d]' : ''}
        />
        <StatCard label="🔄 Last sync" value={syncTitle} sub={syncSub} valueClass="text-[20px]" />
      </div>

      <div className="mb-6 flex gap-3 rounded-lg border border-[#bfdbfe] bg-[#eff6ff] px-4 py-3 text-[13px] text-[#1e40af]">
        <span className="shrink-0" aria-hidden>
          🔗
        </span>
        <div>
          {data.hasSheetsMapping ? (
            <span>
              A Google Sheets column mapping is saved for this organisation. Manual and logged imports run from the
              import wizard.
            </span>
          ) : (
            <span>No Sheets column mapping yet - connect a spreadsheet and map columns in the import wizard.</span>
          )}{' '}
          <Link href="/admin/rota-import" className="font-medium underline underline-offset-2 hover:text-[#1e3a8a]">
            Manage import →
          </Link>
        </div>
      </div>

      <div className="mb-3.5">
        <h2 className="font-authSerif text-[17px] tracking-tight text-[#121212]">Upcoming shifts - this week</h2>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#d8d8d8] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#d8d8d8] bg-[#f5f4f1] text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
                <th className="px-4 py-3">Staff member</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.upcoming.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-[#9b9b9b]">
                    No upcoming shifts for the rest of this week.
                  </td>
                </tr>
              ) : (
                data.upcoming.map((row) => (
                  <tr key={row.id} className="border-b border-[#d8d8d8] last:border-0">
                    <td className="px-4 py-3 font-medium text-[#121212]">{row.staffName}</td>
                    <td className="px-4 py-3 text-[#6b6b6b]">{row.departmentName}</td>
                    <td className="px-4 py-3 text-[#6b6b6b]">{fmtShiftDate(row.start_time)}</td>
                    <td className="px-4 py-3 text-[#6b6b6b]">{fmtShiftTime(row.start_time, row.end_time)}</td>
                    <td className="px-4 py-3 text-[#6b6b6b]">{row.role_label ?? '-'}</td>
                    <td className="px-4 py-3">
                      <Link
                        href="/rota"
                        className="text-[12px] font-medium text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]"
                      >
                        Edit on grid
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-6 text-[12px] text-[#9b9b9b]">
        Full weekly grid, filters, and CSV export live on the{' '}
        <Link href="/rota" className="text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]">
          main rota
        </Link>
        . Import history is on{' '}
        <Link href="/admin/rota-import" className="text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]">
          Sheets import
        </Link>
        .
      </p>
    </div>
  );
}
