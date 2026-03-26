'use client';

import Link from 'next/link';

export function ManagerDashboardClient({
  stats,
  hasDepartments,
}: {
  stats: { pendingUsers: number; pendingBroadcasts: number; shiftsWeek: number };
  hasDepartments: boolean;
}) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-[var(--campsite-text)]">Manager dashboard</h1>
        <p className="mt-1 text-sm text-[var(--campsite-text-secondary)]">
          Your department tools — full editing works best on web.
        </p>
      </div>

      {!hasDepartments ? (
        <p className="text-sm text-amber-200">You are not assigned as a department manager yet.</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Link
          href="/pending-approvals"
          className="rounded-xl border border-[var(--campsite-border)] bg-[var(--campsite-surface)] p-4 hover:border-emerald-600/50"
        >
          <p className="text-xs uppercase text-[var(--campsite-text-muted)]">Pending verifications</p>
          <p className="mt-1 text-2xl font-semibold">{stats.pendingUsers}</p>
        </Link>
        <Link
          href="/broadcasts"
          className="rounded-xl border border-[var(--campsite-border)] bg-[var(--campsite-surface)] p-4 hover:border-emerald-600/50"
        >
          <p className="text-xs uppercase text-[var(--campsite-text-muted)]">Broadcasts awaiting approval</p>
          <p className="mt-1 text-2xl font-semibold">{stats.pendingBroadcasts}</p>
        </Link>
        <Link
          href="/rota"
          className="rounded-xl border border-[var(--campsite-border)] bg-[var(--campsite-surface)] p-4 hover:border-emerald-600/50"
        >
          <p className="text-xs uppercase text-[var(--campsite-text-muted)]">Shifts this week (your depts)</p>
          <p className="mt-1 text-2xl font-semibold">{stats.shiftsWeek}</p>
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/broadcasts"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
        >
          Compose broadcast
        </Link>
        <Link href="/rota" className="rounded-lg border border-[var(--campsite-border)] px-4 py-2 text-sm">
          Open department rota
        </Link>
      </div>
    </div>
  );
}
