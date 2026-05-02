'use client';

import { ExperienceLensBar } from '@/components/experience/ExperienceLensBar';
import Link from 'next/link';
import { useMemo, useState } from 'react';

const statTileClass =
  'block rounded-xl border border-[#d8d8d8] bg-white px-5 py-[18px] transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_12px_rgba(0,0,0,0.04)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#121212]';

const labelRow = 'mb-2.5 flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-[0.06em] text-[#9b9b9b]';

export function ManagerDashboardClient({
  stats,
  hasDepartments,
  departmentNames,
  upcomingItems,
  departmentBreakdown,
}: {
  stats: {
    pendingUsers: number;
    activeUsers: number;
    totalMembers: number;
    pendingBroadcasts: number;
    broadcastsThisWeek: number;
    shiftsWeek: number;
    shiftsToday: number;
    teamsCount: number;
  };
  hasDepartments: boolean;
  departmentNames: string[];
  upcomingItems: Array<{ id: string; title: string; start_time: string; kind: 'event' | 'shift' }>;
  departmentBreakdown: Array<{ id: string; name: string; members: number; shiftsWeek: number }>;
}) {
  const [upcomingLens, setUpcomingLens] = useState<'list' | 'board'>('list');

  const upcomingBoard = useMemo(() => {
    const events = upcomingItems.filter((i) => i.kind !== 'shift');
    const shifts = upcomingItems.filter((i) => i.kind === 'shift');
    return { events, shifts };
  }, [upcomingItems]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-authSerif text-[22px] tracking-tight text-[#121212]">Manager dashboard</h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          Department overview and activity for your assigned teams.
        </p>
      </header>

      {!hasDepartments ? (
        <div
          role="status"
          className="status-banner-warning rounded-xl px-4 py-3 text-[13px]"
        >
          You are not assigned as a department manager yet.
        </div>
      ) : null}

      {hasDepartments ? (
        <div className="rounded-xl border border-[#d8d8d8] bg-[#faf9f6] px-4 py-3 text-[13px] text-[#44403c]">
          Viewing: <span className="font-medium text-[#121212]">{departmentNames.join(', ')}</span>
        </div>
      ) : null}

      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/manager/departments" className={statTileClass}>
          <div className={labelRow}>
            <span aria-hidden>👥</span> Department headcount
          </div>
          <p className="font-authSerif text-[32px] leading-none tracking-tight text-[#121212]">
            {stats.activeUsers}
          </p>
          <p className="mt-2 text-xs text-[#9b9b9b]">
            {stats.totalMembers} total members across your departments
          </p>
        </Link>
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
        <Link href="/manager/teams" className={statTileClass}>
          <div className={labelRow}>
            <span aria-hidden>🧩</span> Department teams
          </div>
          <p className="font-authSerif text-[32px] leading-none tracking-tight text-[#121212]">{stats.teamsCount}</p>
          <p className="mt-2 text-xs text-[#9b9b9b]">Teams currently active in your scope</p>
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
        <Link href="/broadcasts" className={statTileClass}>
          <div className={labelRow}>
            <span aria-hidden>📣</span> Broadcasts sent this week
          </div>
          <p className="font-authSerif text-[32px] leading-none tracking-tight text-[#121212]">
            {stats.broadcastsThisWeek}
          </p>
          <p className="mt-2 text-xs text-[#9b9b9b]">Published Mon-Sun in your departments</p>
        </Link>
        <Link href="/rota" className={statTileClass}>
          <div className={labelRow}>
            <span aria-hidden>🗓</span> Shifts this week
          </div>
          <p className="font-authSerif text-[32px] leading-none tracking-tight text-[#121212]">
            {stats.shiftsWeek}
          </p>
          <p className="mt-2 text-xs text-[#9b9b9b]">Your departments (Mon-Sun)</p>
        </Link>
        <Link href="/rota" className={statTileClass}>
          <div className={labelRow}>
            <span aria-hidden>📍</span> Shifts today
          </div>
          <p className="font-authSerif text-[32px] leading-none tracking-tight text-[#121212]">{stats.shiftsToday}</p>
          <p className="mt-2 text-xs text-[#9b9b9b]">Scheduled for today across your departments</p>
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/broadcasts?tab=feed&compose=1"
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

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="overflow-hidden rounded-xl border border-[#d8d8d8] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#d8d8d8] px-5 py-4">
            <h2 className="font-authSerif text-[18px] tracking-tight text-[#121212]">Upcoming in your departments</h2>
            <ExperienceLensBar
              ariaLabel="Upcoming layout"
              value={upcomingLens}
              onChange={setUpcomingLens}
              choices={[
                { value: 'list', label: 'List' },
                { value: 'board', label: 'Board' },
              ]}
            />
          </div>
          <div className="px-5 py-4">
            {upcomingItems.length === 0 ? (
              <p className="text-sm text-[#9b9b9b]">No upcoming events or shifts in your departments.</p>
            ) : upcomingLens === 'board' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-[#dbeafe] bg-[#f8fafc] p-3">
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#1d4ed8]">Events</h3>
                  <ul className="space-y-2">
                    {upcomingBoard.events.length === 0 ? (
                      <li className="text-[12px] text-[#6b6b6b]">None scheduled.</li>
                    ) : (
                      upcomingBoard.events.map((item) => (
                        <li key={item.id} className="rounded-md border border-white bg-white/80 px-2.5 py-2 text-[12.5px]">
                          <p className="font-medium text-[#121212]">{item.title}</p>
                          <p className="mt-0.5 text-[11.5px] text-[#6b6b6b]">
                            {new Date(item.start_time).toLocaleString('en-GB', { timeZone: 'UTC', 
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </p>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div className="rounded-lg border border-[#e7e5e4] bg-[#faf9f6] p-3">
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#44403c]">Shifts</h3>
                  <ul className="space-y-2">
                    {upcomingBoard.shifts.length === 0 ? (
                      <li className="text-[12px] text-[#6b6b6b]">None scheduled.</li>
                    ) : (
                      upcomingBoard.shifts.map((item) => (
                        <li key={item.id} className="rounded-md border border-white bg-white/80 px-2.5 py-2 text-[12.5px]">
                          <p className="font-medium text-[#121212]">{item.title}</p>
                          <p className="mt-0.5 text-[11.5px] text-[#6b6b6b]">
                            {new Date(item.start_time).toLocaleString('en-GB', { timeZone: 'UTC', 
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </p>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {upcomingItems.map((item) => (
                  <li key={item.id} className="rounded-lg border border-[#ececec] bg-[#faf9f6] px-3 py-2.5">
                    <p className="text-[13px] font-medium text-[#121212]">{item.title}</p>
                    <p className="mt-0.5 text-[12px] text-[#6b6b6b]">
                      {new Date(item.start_time).toLocaleString('en-GB', { timeZone: 'UTC', 
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}{' '}
                      · {item.kind === 'shift' ? 'Shift' : 'Event'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-[#d8d8d8] bg-white">
          <div className="border-b border-[#d8d8d8] px-5 py-4">
            <h2 className="font-authSerif text-[18px] tracking-tight text-[#121212]">Department workload</h2>
          </div>
          <div className="px-5 py-4">
            {departmentBreakdown.length === 0 ? (
              <p className="text-sm text-[#9b9b9b]">No department data available yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {departmentBreakdown.map((dept) => (
                  <li key={dept.id} className="rounded-lg border border-[#ececec] bg-[#faf9f6] px-3 py-2.5">
                    <p className="text-[13px] font-medium text-[#121212]">{dept.name}</p>
                    <p className="mt-0.5 text-[12px] text-[#6b6b6b]">
                      {dept.members} members · {dept.shiftsWeek} shifts this week
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
