import Link from 'next/link';

import { DashboardCampfireAmbient } from '@/components/dashboard/DashboardCampfireAmbient';
import { DashboardCalendarWidget } from '@/components/dashboard/DashboardCalendarWidget';
import { channelPillAccessibleName } from '@/lib/broadcasts/channelCopy';
import { deptTagClass } from '@/lib/broadcasts/deptTagClass';
import type { DashboardHomeModel } from '@/lib/dashboard/loadDashboardHome';
import { relTime } from '@/lib/format/relTime';

function stripPreview(raw: string, max = 140) {
  const t = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}...` : t;
}

function statFillPct(value: number, cap: number) {
  if (value <= 0) return 6;
  return Math.min(100, Math.max(10, Math.round((value / cap) * 100)));
}

function StatBar({ pct, danger }: { pct: number; danger?: boolean }) {
  return (
    <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-[#d8d8d8]">
      <div
        className={danger ? 'h-full rounded-full bg-[#b91c1c]/50' : 'h-full rounded-full bg-[#121212]'}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

const statTileClass =
  'rounded-xl border border-[#d8d8d8] bg-white px-5 py-[18px] transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_12px_rgba(0,0,0,0.04)]';

export function DashboardHome({
  data,
  greetingLine,
  canCompose,
  showPrimaryComposeCta,
  membersStatHref,
  variant = 'dashboard',
}: {
  data: DashboardHomeModel;
  greetingLine: string;
  canCompose: boolean;
  showPrimaryComposeCta: boolean;
  /** When set, active-members tile links here; when null but tile is shown, tile is non-interactive. */
  membersStatHref: string | null;
  variant?: 'dashboard' | 'admin';
}) {
  const now = new Date();
  const isAdmin = variant === 'admin';
  const composeHref = canCompose ? '/broadcasts?tab=compose' : '/broadcasts';
  const pendingHref = isAdmin ? '/admin/pending' : '/pending-approvals';
  const showUnreadBroadcastKpi = data.showBroadcastUnreadCount !== false;
  const showBroadcastTotal = data.broadcastTotal !== undefined;
  const showMemberTotal = data.memberActiveTotal !== undefined;
  const statTileCount = 2 + (showBroadcastTotal ? 1 : 0) + (showMemberTotal ? 1 : 0);
  const statGridLg =
    statTileCount <= 2 ? 'lg:grid-cols-2' : statTileCount === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4';

  const statScope = data.dashboardStatScope;
  const broadcastSentSubline =
    statScope === 'dept' ? 'Sent in your department(s)' : 'Sent in your organisation';
  const memberFootnote = (
    <div className="mt-2 text-xs text-[#9b9b9b]">
      {statScope === 'dept'
        ? 'Active members in your department(s)'
        : membersStatHref
          ? 'Profiles with active status'
          : 'In your organisation'}
    </div>
  );

  const memberTileInner = (
    <>
      <div className="mb-2.5 flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-[0.06em] text-[#9b9b9b]">
        <span>👥</span> Active members
      </div>
      <div className="font-authSerif text-[32px] leading-none tracking-tight text-[#121212]">
        {data.memberActiveTotal}
      </div>
      {memberFootnote}
      {isAdmin && data.memberActiveTotal !== undefined ? (
        <StatBar pct={statFillPct(data.memberActiveTotal, 500)} />
      ) : null}
    </>
  );

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-[28px]">
      {variant === 'dashboard' ? <DashboardCampfireAmbient /> : null}
      {variant === 'dashboard' ? <h1 className="sr-only">Dashboard</h1> : null}
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-authSerif text-[28px] leading-tight tracking-tight text-[#121212]">
            {greetingLine}
          </h2>
          <p className="mt-1 text-[13px] text-[#6b6b6b]">
            {now.toLocaleDateString(undefined, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
            {' · '}
            {data.orgName}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {showPrimaryComposeCta ? (
            <Link
              href={composeHref}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#121212] px-4 text-[13px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90"
            >
              ✏ New broadcast
            </Link>
          ) : null}
          {canCompose && !showPrimaryComposeCta ? (
            <Link
              href={composeHref}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#121212] px-4 text-[13px] font-medium text-[#faf9f6] shadow-sm transition-opacity hover:opacity-90"
            >
              ✏ Submit draft for approval
            </Link>
          ) : null}
        </div>
      </div>

      <div className={`mb-6 grid grid-cols-1 gap-3.5 sm:grid-cols-2 ${statGridLg}`}>
        {showBroadcastTotal ? (
          <Link href="/broadcasts" className={statTileClass}>
            <div className="mb-2.5 flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-[0.06em] text-[#9b9b9b]">
              <span>📡</span> Total broadcasts
            </div>
            <div className="font-authSerif text-[32px] leading-none tracking-tight text-[#121212]">
              {data.broadcastTotal}
            </div>
            <div className="mt-2 text-xs text-[#9b9b9b]">{broadcastSentSubline}</div>
            {isAdmin && data.broadcastTotal !== undefined ? (
              <StatBar pct={statFillPct(data.broadcastTotal, 200)} />
            ) : null}
          </Link>
        ) : null}

        {showMemberTotal ? (
          membersStatHref ? (
            <Link href={membersStatHref} className={statTileClass}>
              {memberTileInner}
            </Link>
          ) : (
            <div className={statTileClass}>{memberTileInner}</div>
          )
        ) : null}

        {data.pendingCount !== null ? (
          <Link
            href={pendingHref}
            className="rounded-xl border border-[#d8d8d8] bg-white px-5 py-[18px] transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_12px_rgba(0,0,0,0.04)]"
          >
            <div className="mb-2.5 flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-[0.06em] text-[#9b9b9b]">
              <span>⏳</span> Pending approvals
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
              {data.pendingCount > 0 ? 'Needs your attention' : 'All caught up'}
            </div>
            {isAdmin ? (
              <StatBar pct={statFillPct(data.pendingCount, 12)} danger={data.pendingCount > 0} />
            ) : null}
          </Link>
        ) : showUnreadBroadcastKpi ? (
          <Link
            href="/broadcasts"
            className="rounded-xl border border-[#d8d8d8] bg-white px-5 py-[18px] transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_12px_rgba(0,0,0,0.04)]"
          >
            <div className="mb-2.5 flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-[0.06em] text-[#9b9b9b]">
              <span>📬</span> Unread
            </div>
            <div className="font-authSerif text-[32px] leading-none tracking-tight text-[#121212]">
              {data.unreadCount}
            </div>
            <div className="mt-2 text-xs text-[#9b9b9b]">Broadcasts you haven&apos;t opened</div>
          </Link>
        ) : (
          <Link
            href="/broadcasts"
            className="rounded-xl border border-[#d8d8d8] bg-white px-5 py-[18px] transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_12px_rgba(0,0,0,0.04)]"
          >
            <div className="mb-2.5 flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-[0.06em] text-[#9b9b9b]">
              <span>📬</span> Broadcasts
            </div>
            <div className="mt-2 text-[13px] font-medium leading-snug text-[#121212]">View feed</div>
            <div className="mt-2 text-xs text-[#9b9b9b]">Updates from your organisation</div>
          </Link>
        )}

        <Link
          href="/rota"
          className="rounded-xl border border-[#d8d8d8] bg-white px-5 py-[18px] transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_12px_rgba(0,0,0,0.04)]"
        >
          <div className="mb-2.5 flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-[0.06em] text-[#9b9b9b]">
            <span>🗓</span> Shifts this week
          </div>
          <div className="font-authSerif text-[32px] leading-none tracking-tight text-[#121212]">
            {data.shiftsThisWeek}
          </div>
          {isAdmin ? (
            <div className="mt-2 space-y-1 text-xs text-[#9b9b9b]">
              <p>Organisation shifts in the next 7 days</p>
              {data.nextShiftSummary ? (
                <p>
                  Your next:{' '}
                  <span className="font-medium text-[#121212]">{data.nextShiftSummary}</span>
                </p>
              ) : (
                <p>No personal upcoming shifts</p>
              )}
            </div>
          ) : (
            <div className="mt-2 text-xs text-[#9b9b9b]">
              {data.nextShiftSummary ? (
                <>
                  Next: <span className="font-medium text-[#121212]">{data.nextShiftSummary}</span>
                </>
              ) : (
                'No upcoming shifts scheduled'
              )}
            </div>
          )}
          {isAdmin ? <StatBar pct={statFillPct(data.shiftsThisWeek, 80)} /> : null}
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            href: composeHref,
            icon: '✏️',
            label: !canCompose ? 'Broadcasts' : showPrimaryComposeCta ? 'New broadcast' : 'New draft',
            sub: !canCompose
              ? 'View feed'
              : showPrimaryComposeCta
                ? isAdmin
                  ? 'Send to your dept'
                  : 'Send to your teams'
                : 'Submit for approval',
          },
          { href: '/rota', icon: '🗓', label: 'View rota', sub: 'This week' },
          { href: '/discount', icon: '🎫', label: 'Discount card', sub: 'Your QR code' },
          data.pendingCount !== null
            ? {
                href: pendingHref,
                icon: '⏳',
                label: 'Pending members',
                sub: data.pendingCount > 0 ? `${data.pendingCount} awaiting` : 'Approvals',
              }
            : { href: '/calendar', icon: '📅', label: 'Calendar', sub: 'Team events' },
        ].map((qa) => (
            <Link
              key={qa.href + qa.label}
              href={qa.href}
              className="flex flex-col items-start gap-2.5 rounded-xl border border-[#d8d8d8] bg-white p-4 transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_12px_rgba(0,0,0,0.04)]"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#d8d8d8] bg-[#f5f4f1] text-[17px]">
                {qa.icon}
              </div>
              <div>
                <div className="text-[13px] font-medium leading-snug text-[#121212]">{qa.label}</div>
                <div className="mt-0.5 text-[11.5px] text-[#9b9b9b]">{qa.sub}</div>
              </div>
            </Link>
          ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
        <div>
          <div className="mb-3.5 flex items-center justify-between">
            <h3 className="font-authSerif text-[17px] tracking-tight text-[#121212]">Recent broadcasts</h3>
            <Link
              href={isAdmin ? '/admin/broadcasts' : '/broadcasts'}
              className="text-[12.5px] text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]"
            >
              View all →
            </Link>
          </div>
          <div className="flex flex-col gap-2.5">
            {data.recentBroadcasts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#d8d8d8] bg-white px-6 py-12 text-center text-sm text-[#9b9b9b]">
                No broadcasts yet. Check back soon.
              </div>
            ) : (
              data.recentBroadcasts.map((b) => {
                const deptName = b.departments?.name ?? 'General';
                const channelName = b.broadcast_channels?.name ?? '';
                const teamName = b.department_teams?.name ?? '';
                const collabDepartments = b.collab_departments ?? [];
                const unread = b.read === false;
                const senderName = b.profiles?.full_name?.trim() || 'Unknown sender';
                const sentLabel = b.sent_at
                  ? new Date(b.sent_at).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })
                  : 'Send time unavailable';
                return (
                  <Link
                    key={b.id}
                    href={`/broadcasts/${b.id}`}
                    aria-label={
                      unread
                        ? `${b.title}. Unread broadcast. Sent ${relTime(b.sent_at)}.`
                        : `${b.title}. Read. Sent ${relTime(b.sent_at)}.`
                    }
                    className={[
                      'relative rounded-xl border px-[18px] py-4 transition-[box-shadow,border-color]',
                      unread
                        ? 'border-sky-200 bg-sky-50/90 hover:border-sky-300 hover:shadow-[0_1px_3px_rgba(14,165,233,0.12),0_4px_12px_rgba(0,0,0,0.04)]'
                        : 'border-[#d8d8d8] bg-white hover:border-[#c8c8c8] hover:shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_12px_rgba(0,0,0,0.04)]',
                      unread
                        ? "overflow-hidden before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:rounded-l-xl before:bg-sky-600 before:content-['']"
                        : '',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div
                        className={[
                          'min-w-0 flex-1 text-sm leading-snug text-[#121212]',
                          unread ? 'font-semibold' : 'font-medium',
                        ].join(' ')}
                      >
                        {b.title}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {unread ? (
                          <span className="inline-flex items-center rounded-full border border-sky-300 bg-white/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-900">
                            Unread
                          </span>
                        ) : null}
                        <div className="text-[11.5px] text-[#9b9b9b]">{relTime(b.sent_at)}</div>
                      </div>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-[#6b6b6b]">
                      {stripPreview(b.body)}
                    </p>
                    <p className="mt-2 text-[11.5px] text-[#6b6b6b]">
                      Sent by <span className="font-medium text-[#121212]">{senderName}</span>
                      <span className="mx-1.5 text-[#9b9b9b]">·</span>
                      <span>{sentLabel}</span>
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {b.is_pinned ? (
                        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-900">
                          Pinned
                        </span>
                      ) : null}
                      {b.is_mandatory ? (
                        <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[11px] font-medium text-red-900">
                          Mandatory
                        </span>
                      ) : null}
                      {b.is_org_wide ? (
                        <span className="inline-flex items-center rounded-full border border-[#e7e5e4] bg-[#f5f5f4] px-2.5 py-0.5 text-[11px] font-medium text-[#44403c]">
                          Org-wide
                        </span>
                      ) : null}
                      <span
                        className={[
                          'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
                          deptTagClass(deptName),
                        ].join(' ')}
                      >
                        {deptName}
                      </span>
                      {channelName ? (
                        <span
                          className="inline-flex items-center rounded-full border border-[#d8d8d8] bg-[#f5f4f1] px-2.5 py-0.5 text-[11px] font-medium text-[#6b6b6b]"
                          title={channelPillAccessibleName(channelName)}
                          aria-label={channelPillAccessibleName(channelName)}
                        >
                          {channelName}
                        </span>
                      ) : b.is_org_wide ? (
                        <span className="inline-flex items-center rounded-full border border-[#d8d8d8] bg-[#f5f4f1] px-2.5 py-0.5 text-[11px] font-medium text-[#6b6b6b]">
                          All channels
                        </span>
                      ) : null}
                      {teamName ? (
                        <span className="inline-flex items-center rounded-full border border-[#e9d5ff] bg-[#faf5ff] px-2.5 py-0.5 text-[11px] font-medium text-[#6b21a8]">
                          {teamName}
                        </span>
                      ) : null}
                      {collabDepartments.map((d) => (
                        <span
                          key={`${b.id}-collab-${d.id}`}
                          className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-2.5 py-0.5 text-[11px] font-medium text-[#1d4ed8]"
                        >
                          {d.name}
                        </span>
                      ))}
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <DashboardCalendarWidget
            eventDays={data.calendarEventDays}
            initialYear={data.calendarYear}
            initialMonth={data.calendarMonth}
            todayY={now.getFullYear()}
            todayM={now.getMonth()}
            todayD={now.getDate()}
            upcomingEvents={data.upcomingEvents}
          />

          {data.pendingCount !== null ? (
            <div className="overflow-hidden rounded-xl border border-[#d8d8d8] bg-white">
              <div className="flex items-center justify-between border-b border-[#d8d8d8] px-[18px] py-4">
                <div className="flex items-center gap-2 text-sm font-medium text-[#121212]">
                  Pending verifications
                  {data.pendingCount > 0 ? (
                    <span className="rounded-full bg-[#E11D48] px-2 py-0.5 text-[10.5px] font-bold text-white">
                      {data.pendingCount}
                    </span>
                  ) : null}
                </div>
                <Link
                  href={pendingHref}
                  className="text-[12.5px] text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]"
                >
                  View all
                </Link>
              </div>
              <div className="flex flex-col">
                {data.pendingPreview.length === 0 ? (
                  <p className="px-[18px] py-8 text-center text-sm text-[#9b9b9b]">No pending verifications</p>
                ) : (
                  data.pendingPreview.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 border-b border-[#d8d8d8] px-[18px] py-3 last:border-0 hover:bg-[#f5f4f1]"
                    >
                      <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[#121212]/10 text-[11px] font-semibold text-[#121212]">
                        {initials(p.full_name ?? p.email ?? '?')}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium text-[#121212]">{p.full_name ?? 'Member'}</div>
                        <div className="text-[11.5px] text-[#9b9b9b]">{p.deptLine}</div>
                      </div>
                      <Link
                        href={pendingHref}
                        className="shrink-0 rounded-md bg-[#dcfce7] px-3 py-1 text-[12px] font-medium text-[#15803D] ring-1 ring-[#bbf7d0] hover:bg-[#bbf7d0]"
                      >
                        Review
                      </Link>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return '?';
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return (p[0]![0]! + p[p.length - 1]![0]!).toUpperCase();
}
