import type { ReactNode } from 'react';
import Link from 'next/link';
import type { AdminOverviewModel } from '@/lib/admin/loadAdminOverview';

function statFillPct(value: number, cap: number) {
  if (value <= 0) return 6;
  return Math.min(100, Math.max(10, Math.round((value / cap) * 100)));
}

function roleBadgeClass(role: string): string {
  const m: Record<string, string> = {
    org_admin: 'bg-[#1a1a1a] text-[#faf9f6]',
    super_admin: 'bg-[#1a1a1a] text-[#faf9f6]',
    manager: 'bg-[#14532d] text-[#86efac]',
    coordinator: 'bg-[#3b0764] text-[#d8b4fe]',
    administrator: 'bg-[#431407] text-[#fdba74]',
    duty_manager: 'bg-[#292524] text-[#e7e5e4]',
    csa: 'border border-[#d8d8d8] bg-[#f5f4f1] text-[#6b6b6b]',
    society_leader: 'bg-[#fef3c7] text-[#92400e]',
  };
  return m[role] ?? 'border border-[#d8d8d8] bg-[#f5f4f1] text-[#6b6b6b]';
}

function StatShell({
  href,
  children,
}: {
  href?: string;
  children: ReactNode;
}) {
  const className =
    'rounded-xl border border-[#d8d8d8] bg-white px-5 py-[18px] transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_12px_rgba(0,0,0,0.04)]';
  if (href) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return <div className={`${className} cursor-default hover:translate-y-0 hover:shadow-none`}>{children}</div>;
}

export function AdminOverviewView({ data }: { data: AdminOverviewModel }) {
  const canUsers = data.canManageUsers;
  const canBroadcastsAdmin = data.canManageBroadcasts;
  const canDepts = data.canManageDepartments;
  const canSettings = data.canManageSettings;

  const bcPrev = data.broadcastsPrev30d || 0;
  const bcCur = data.broadcasts30d || 0;
  let broadcastTrend = 'Last 30 days';
  if (bcPrev > 0) {
    const pct = Math.round(((bcCur - bcPrev) / bcPrev) * 100);
    if (pct > 0) broadcastTrend = `↑ ${pct}% vs prior 30 days`;
    else if (pct < 0) broadcastTrend = `↓ ${Math.abs(pct)}% vs prior 30 days`;
    else broadcastTrend = 'Flat vs prior 30 days';
  } else if (bcCur > 0) {
    broadcastTrend = 'Last 30 days';
  }

  const totalActiveForRoles = data.roleBreakdown.reduce((s, r) => s + r.count, 0) || 1;

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-7">
      <div className="mb-6 flex flex-col gap-4 sm:mb-7 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">
            Admin Overview
          </h1>
          <p className="mt-1 text-[13px] text-[#6b6b6b]">{data.accessLine}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canUsers ? (
            <Link
              href="/admin/users"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-[#121212] px-4 text-[13px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90"
            >
              + Invite member
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <StatShell href={canUsers ? '/admin/users' : undefined}>
          <div className="mb-2.5 flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-[0.06em] text-[#9b9b9b]">
            👥 Total members
          </div>
          <div className="font-authSerif text-[32px] leading-none tracking-tight text-[#121212]">
            {data.totalMembers}
          </div>
          <div className="mt-2 text-xs text-[#9b9b9b]">
            {data.newMembersWeek > 0 ? (
              <>
                <span className="font-medium text-[#15803d]">↑ {data.newMembersWeek}</span> this week
              </>
            ) : (
              'No new members this week'
            )}
          </div>
          <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-[#d8d8d8]">
            <div
              className="h-full rounded-full bg-[#121212]"
              style={{ width: `${statFillPct(data.totalMembers, 400)}%` }}
            />
          </div>
        </StatShell>

        <StatShell href="/admin/pending">
          <div className="mb-2.5 flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-[0.06em] text-[#9b9b9b]">
            ⏳ Pending approval
          </div>
          <div
            className={[
              'font-authSerif text-[32px] leading-none tracking-tight',
              data.pendingCount > 0 ? 'text-[#b91c1c]' : 'text-[#121212]',
            ].join(' ')}
          >
            {data.pendingCount}
          </div>
          <div className="mt-2 text-xs text-[#9b9b9b]">
            {data.pendingCount > 0 ? (
              <span className="font-medium text-[#b91c1c]">Action required</span>
            ) : (
              'All caught up'
            )}
          </div>
          <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-[#d8d8d8]">
            <div
              className="h-full rounded-full bg-[#b91c1c]/50"
              style={{ width: `${data.pendingCount > 0 ? 100 : statFillPct(data.pendingCount, 8)}%` }}
            />
          </div>
        </StatShell>

        <StatShell href={canBroadcastsAdmin ? '/admin/broadcasts' : '/broadcasts'}>
          <div className="mb-2.5 flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-[0.06em] text-[#9b9b9b]">
            📡 Broadcasts (30d)
          </div>
          <div className="font-authSerif text-[32px] leading-none tracking-tight text-[#121212]">
            {data.broadcasts30d}
          </div>
          <div className="mt-2 text-xs text-[#9b9b9b]">
            {bcPrev > 0 && broadcastTrend.startsWith('↑') ? (
              <span className="font-medium text-[#15803d]">{broadcastTrend}</span>
            ) : bcPrev > 0 && broadcastTrend.startsWith('↓') ? (
              <span className="font-medium text-[#b91c1c]">{broadcastTrend}</span>
            ) : (
              broadcastTrend
            )}
          </div>
          <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-[#d8d8d8]">
            <div
              className="h-full rounded-full bg-[#121212]"
              style={{ width: `${statFillPct(data.broadcasts30d, 80)}%` }}
            />
          </div>
        </StatShell>

        <StatShell href={canDepts ? '/admin/departments' : undefined}>
          <div className="mb-2.5 flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-[0.06em] text-[#9b9b9b]">
            🏢 Departments
          </div>
          <div className="font-authSerif text-[32px] leading-none tracking-tight text-[#121212]">
            {data.deptTotal}
          </div>
          <div className="mt-2 text-xs text-[#9b9b9b]">
            {data.deptSocietiesAndClubs} societies/clubs · {data.deptDepartments} depts
          </div>
          <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-[#d8d8d8]">
            <div
              className="h-full rounded-full bg-[#121212]"
              style={{ width: `${statFillPct(data.deptTotal, 24)}%` }}
            />
          </div>
        </StatShell>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
        <div>
          <div className="mb-3.5 flex items-center gap-3">
            <h2 className="font-authSerif text-[17px] tracking-tight text-[#121212]">Recent activity</h2>
          </div>
          <div className="overflow-hidden rounded-xl border border-[#d8d8d8] bg-white">
            <div className="px-1.5 py-1">
              {data.activities.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-[#9b9b9b]">No recent activity yet.</p>
              ) : (
                data.activities.map((a) => (
                  <div
                    key={a.id}
                    className="flex gap-3 border-b border-[#d8d8d8] px-3.5 py-3.5 last:border-0"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#d8d8d8] bg-[#f5f4f1] text-[14px]">
                      {a.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] leading-snug text-[#6b6b6b]">{a.text}</p>
                      <p className="mt-1 text-[11px] text-[#9b9b9b]">{a.timeLabel}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <div className="mb-3.5 flex items-center justify-between">
              <h2 className="font-authSerif text-[17px] tracking-tight text-[#121212]">Quick actions</h2>
            </div>
            <div className="flex flex-col gap-2">
              <Link
                href="/admin/pending"
                className="inline-flex w-full items-center justify-start rounded-lg border border-[#d8d8d8] bg-white px-4 py-2.5 text-left text-[13px] text-[#6b6b6b] transition-colors hover:bg-[#f5f4f1]"
              >
                ⏳ Review{data.pendingCount > 0 ? ` ${data.pendingCount}` : ''} pending approvals
              </Link>
              {canUsers ? (
                <Link
                  href="/admin/users"
                  className="inline-flex w-full items-center justify-start rounded-lg border border-[#d8d8d8] bg-white px-4 py-2.5 text-left text-[13px] text-[#6b6b6b] transition-colors hover:bg-[#f5f4f1]"
                >
                  ✉️ Invite a new member
                </Link>
              ) : null}
              {canDepts ? (
                <Link
                  href="/admin/departments"
                  className="inline-flex w-full items-center justify-start rounded-lg border border-[#d8d8d8] bg-white px-4 py-2.5 text-left text-[13px] text-[#6b6b6b] transition-colors hover:bg-[#f5f4f1]"
                >
                  🏢 Manage departments
                </Link>
              ) : null}
              {canBroadcastsAdmin ? (
                <Link
                  href="/admin/broadcasts"
                  className="inline-flex w-full items-center justify-start rounded-lg border border-[#d8d8d8] bg-white px-4 py-2.5 text-left text-[13px] text-[#6b6b6b] transition-colors hover:bg-[#f5f4f1]"
                >
                  📡{' '}
                  {data.draftBroadcastsCount > 0
                    ? `Review ${data.draftBroadcastsCount} draft broadcast${data.draftBroadcastsCount === 1 ? '' : 's'}`
                    : 'Broadcast admin'}
                </Link>
              ) : (
                <Link
                  href="/broadcasts"
                  className="inline-flex w-full items-center justify-start rounded-lg border border-[#d8d8d8] bg-white px-4 py-2.5 text-left text-[13px] text-[#6b6b6b] transition-colors hover:bg-[#f5f4f1]"
                >
                  📡 Open broadcasts
                </Link>
              )}
              {canSettings ? (
                <Link
                  href="/admin/settings"
                  className="inline-flex w-full items-center justify-start rounded-lg border border-[#d8d8d8] bg-white px-4 py-2.5 text-left text-[13px] text-[#6b6b6b] transition-colors hover:bg-[#f5f4f1]"
                >
                  ⚙️ Organisation settings
                </Link>
              ) : null}
            </div>
          </div>

          <div>
            <div className="mb-3.5">
              <h2 className="font-authSerif text-[17px] tracking-tight text-[#121212]">Members by role</h2>
            </div>
            <div className="rounded-xl border border-[#d8d8d8] bg-white p-4">
              {data.roleBreakdown.length === 0 ? (
                <p className="text-sm text-[#9b9b9b]">No active members.</p>
              ) : (
                <div className="space-y-2.5">
                  {data.roleBreakdown.map((r) => {
                    const pct = Math.round((r.count / totalActiveForRoles) * 100);
                    return (
                      <div key={r.role} className="flex items-center gap-2.5">
                        <span
                          className={[
                            'inline-flex min-w-[118px] shrink-0 justify-center rounded-full px-2.5 py-1 text-[11px] font-semibold',
                            roleBadgeClass(r.role),
                          ].join(' ')}
                        >
                          {r.label}
                        </span>
                        <div className="h-[5px] min-w-0 flex-1 overflow-hidden rounded-full bg-[#d8d8d8]">
                          <div
                            className="h-full rounded-full bg-[#121212]/70"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-7 shrink-0 text-right text-[12px] text-[#9b9b9b]">{r.count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
