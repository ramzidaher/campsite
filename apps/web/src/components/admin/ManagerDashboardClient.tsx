'use client';

import Link from 'next/link';

const statTileClass =
  'block rounded-xl border border-[#d8d8d8] bg-white px-5 py-[18px] transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_12px_rgba(0,0,0,0.04)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#121212]';

const labelRow = 'mb-2.5 flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-[0.06em] text-[#9b9b9b]';

export function ManagerDashboardClient({
  stats,
  hasDepartments,
}: {
  stats: { pendingUsers: number; pendingBroadcasts: number; shiftsWeek: number };
  hasDepartments: boolean;
}) {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-authSerif text-[22px] tracking-tight text-[#121212]">Manager dashboard</h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          Your department tools — full editing works best on web.
        </p>
      </header>

      {!hasDepartments ? (
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950"
        >
          You are not assigned as a department manager yet.
        </div>
      ) : null}

      <div className="grid gap-3.5 sm:grid-cols-3">
        <Link href="/pending-approvals" className={statTileClass}>
          <div className={labelRow}>
            <span aria-hidden>⏳</span> Pending verifications
          </div>
          <p
            className={[
              'font-authSerif text-[32px] leading-none tracking-tight',
              stats.pendingUsers > 0 ? 'text-[#b91c1c]' : 'text-[#121212]',
            ].join(' ')}
          >
            {stats.pendingUsers}
          </p>
          <p className="mt-2 text-xs text-[#9b9b9b]">Members awaiting approval in your departments</p>
        </Link>
        <Link href="/broadcasts" className={statTileClass}>
          <div className={labelRow}>
            <span aria-hidden>📡</span> Broadcasts awaiting approval
          </div>
          <p
            className={[
              'font-authSerif text-[32px] leading-none tracking-tight',
              stats.pendingBroadcasts > 0 ? 'text-[#b91c1c]' : 'text-[#121212]',
            ].join(' ')}
          >
            {stats.pendingBroadcasts}
          </p>
          <p className="mt-2 text-xs text-[#9b9b9b]">Submitted from your departments</p>
        </Link>
        <Link href="/rota" className={statTileClass}>
          <div className={labelRow}>
            <span aria-hidden>🗓</span> Shifts this week
          </div>
          <p className="font-authSerif text-[32px] leading-none tracking-tight text-[#121212]">
            {stats.shiftsWeek}
          </p>
          <p className="mt-2 text-xs text-[#9b9b9b]">Your departments (Mon–Sun)</p>
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/broadcasts?tab=compose"
          className="inline-flex h-10 items-center justify-center rounded-lg bg-[#008B60] px-4 text-[13px] font-medium text-white transition hover:bg-[#007a54] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008B60]"
        >
          Compose broadcast
        </Link>
        <Link
          href="/rota"
          className="inline-flex h-10 items-center justify-center rounded-lg border border-[#d8d8d8] bg-white px-4 text-[13px] font-medium text-[#121212] transition hover:bg-[#f5f4f1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#121212]"
        >
          Open department rota
        </Link>
      </div>
    </div>
  );
}
