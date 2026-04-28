'use client';

import type { ShellBadgeCounts } from '@/lib/shell/shellBadgeCounts';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type SnapshotAccent =
  | 'hiring'
  | 'jobsLive'
  | 'jobsDraft'
  | 'applicants'
  | 'schedule'
  | 'directory'
  | 'alerts'
  | 'onboarding';

type HrOverviewStats = {
  liveJobs: number | null;
  draftJobs: number | null;
  applications: number | null;
  applicationsWeek: number | null;
  activeMembers: number | null;
  upcomingInterviewSlots: number | null;
};

const SNAPSHOT_ACCENT_TOP: Record<SnapshotAccent, string> = {
  hiring: 'border-t-[#7c3aed]',
  jobsLive: 'border-t-[#16a34a]',
  jobsDraft: 'border-t-[#a8a29e]',
  applicants: 'border-t-[#2563eb]',
  schedule: 'border-t-[#f59e0b]',
  directory: 'border-t-[#ea580c]',
  alerts: 'border-t-[#dc2626]',
  onboarding: 'border-t-[#0d9488]',
};

function StatTile({
  href,
  accent,
  eyebrow,
  value,
  label,
  sub,
}: {
  href: string;
  accent: SnapshotAccent;
  eyebrow: string;
  value: number | string;
  label: string;
  sub?: string;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className={`group flex min-h-[11.5rem] flex-col overflow-hidden rounded-xl border border-[#e8e8e8] bg-white border-t-4 p-6 shadow-sm transition-shadow hover:shadow-[0_6px_24px_rgba(0,0,0,0.06)] ${SNAPSHOT_ACCENT_TOP[accent]}`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">{eyebrow}</p>
      <p className="mt-2 text-[30px] font-bold leading-none tracking-tight text-[#121212] tabular-nums">{value}</p>
      <p className="mt-2 text-[13px] font-semibold leading-snug text-[#121212]">{label}</p>
      {sub ? <p className="mt-1 text-[12px] leading-relaxed text-[#6b6b6b]">{sub}</p> : null}
      <div className="mt-auto border-t border-[#f0f0f0] pt-4">
        <span className="text-[12.5px] font-medium text-[#121212] transition-colors group-hover:underline">
          View details -&gt;
        </span>
      </div>
    </Link>
  );
}

function countDisplay(value: number | null | undefined, loading: boolean): number | string {
  if (typeof value === 'number') return value;
  return loading ? '...' : '-';
}

export function HrOverviewSnapshotClient({
  permissionKeys,
  badges,
}: {
  permissionKeys: string[];
  badges: ShellBadgeCounts;
}) {
  const [counts, setCounts] = useState<HrOverviewStats | null>(null);
  const [countsLoading, setCountsLoading] = useState(true);

  const canRecruitment = useMemo(
    () =>
      permissionKeys.includes('recruitment.view') ||
      permissionKeys.includes('recruitment.manage') ||
      permissionKeys.includes('recruitment.approve_request'),
    [permissionKeys]
  );
  const canCreateRequest = useMemo(
    () => permissionKeys.includes('recruitment.create_request'),
    [permissionKeys]
  );
  const canViewJobs = useMemo(() => permissionKeys.includes('jobs.view'), [permissionKeys]);
  const canViewApplications = useMemo(() => permissionKeys.includes('applications.view'), [permissionKeys]);
  const canViewAllRecords = useMemo(() => permissionKeys.includes('hr.view_records'), [permissionKeys]);
  const canViewTeamRecords = useMemo(() => permissionKeys.includes('hr.view_direct_reports'), [permissionKeys]);
  const canViewInterviews = useMemo(
    () => permissionKeys.includes('interviews.view') || permissionKeys.includes('interviews.book_slot'),
    [permissionKeys]
  );
  const canViewMetricAlerts = canViewAllRecords;
  const canViewOnboarding = useMemo(
    () =>
      permissionKeys.includes('onboarding.manage_runs') ||
      permissionKeys.includes('onboarding.manage_templates') ||
      permissionKeys.includes('onboarding.complete_own_tasks'),
    [permissionKeys]
  );
  const needsCounts = canViewJobs || canViewApplications || canViewAllRecords || canViewInterviews;

  useEffect(() => {
    if (!needsCounts) {
      setCountsLoading(false);
      return;
    }

    let active = true;
    const controller = new AbortController();

    async function loadCounts() {
      try {
        const response = await fetch('/api/hr/overview-stats', {
          cache: 'no-store',
          credentials: 'include',
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => ({}))) as Partial<HrOverviewStats> & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? 'Failed to load people snapshot counts.');
        if (!active) return;
        setCounts({
          liveJobs: typeof payload.liveJobs === 'number' ? payload.liveJobs : null,
          draftJobs: typeof payload.draftJobs === 'number' ? payload.draftJobs : null,
          applications: typeof payload.applications === 'number' ? payload.applications : null,
          applicationsWeek: typeof payload.applicationsWeek === 'number' ? payload.applicationsWeek : null,
          activeMembers: typeof payload.activeMembers === 'number' ? payload.activeMembers : null,
          upcomingInterviewSlots:
            typeof payload.upcomingInterviewSlots === 'number' ? payload.upcomingInterviewSlots : null,
        });
      } catch {
        if (!active) return;
        setCounts(null);
      } finally {
        if (active) setCountsLoading(false);
      }
    }

    void loadCounts();

    return () => {
      active = false;
      controller.abort();
    };
  }, [needsCounts]);

  return (
    <section className="mt-2" aria-labelledby="people-snapshot-heading">
      <h2 id="people-snapshot-heading" className="mb-3 text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">
        Snapshot
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {canRecruitment || canCreateRequest ? (
          <StatTile
            href="/hr/hiring/requests"
            accent="hiring"
            eyebrow="Hiring"
            value={badges.recruitment_pending_review}
            label="Requests awaiting review"
            sub={
              badges.recruitment_notifications > 0
                ? `${badges.recruitment_notifications} unread recruitment update${badges.recruitment_notifications === 1 ? '' : 's'}`
                : badges.recruitment_pending_review === 0
                  ? 'Nothing waiting in the queue'
                  : undefined
            }
          />
        ) : null}

        {canViewJobs ? (
          <>
            <StatTile
              href="/hr/jobs"
              accent="jobsLive"
              eyebrow="Jobs"
              value={countDisplay(counts?.liveJobs, countsLoading)}
              label="Live listings"
              sub={countsLoading && counts?.liveJobs == null ? 'Loading published roles' : 'Published roles'}
            />
            <StatTile
              href="/hr/jobs"
              accent="jobsDraft"
              eyebrow="Jobs"
              value={countDisplay(counts?.draftJobs, countsLoading)}
              label="Draft listings"
              sub={countsLoading && counts?.draftJobs == null ? 'Loading unpublished roles' : 'Not yet published'}
            />
          </>
        ) : null}

        {canViewApplications ? (
          <StatTile
            href="/hr/applications"
            accent="applicants"
            eyebrow="Applicants"
            value={countDisplay(counts?.applications, countsLoading)}
            label="Across all open roles"
            sub={
              typeof counts?.applicationsWeek === 'number' && counts.applicationsWeek > 0
                ? `${counts.applicationsWeek} new in the last 7 days`
                : badges.application_notifications > 0
                  ? `${badges.application_notifications} unread update${badges.application_notifications === 1 ? '' : 's'}`
                  : countsLoading
                    ? 'Loading recent applications'
                    : 'All stages'
            }
          />
        ) : null}

        {canViewInterviews ? (
          <StatTile
            href="/hr/interviews"
            accent="schedule"
            eyebrow="Schedule"
            value={countDisplay(counts?.upcomingInterviewSlots, countsLoading)}
            label="Interview slots (14 days)"
            sub={countsLoading && counts?.upcomingInterviewSlots == null ? 'Loading schedule' : 'Available and booked'}
          />
        ) : null}

        {canViewAllRecords ? (
          <StatTile
            href="/hr/records"
            accent="directory"
            eyebrow="Directory"
            value={countDisplay(counts?.activeMembers, countsLoading)}
            label="Active people in your org"
            sub={countsLoading && counts?.activeMembers == null ? 'Loading member count' : 'Search and HR files'}
          />
        ) : canViewTeamRecords ? (
          <StatTile
            href="/hr/records"
            accent="directory"
            eyebrow="Directory"
            value="-"
            label="Team HR records"
            sub="Your team's files"
          />
        ) : null}

        {canViewMetricAlerts ? (
          <StatTile
            href="/hr/hr-metric-alerts"
            accent="alerts"
            eyebrow="Alerts"
            value={badges.hr_metric_notifications}
            label="HR metric notifications"
            sub={badges.hr_metric_notifications === 0 ? 'Inbox clear' : 'Unread items'}
          />
        ) : null}

        {canViewOnboarding && badges.onboarding_active > 0 ? (
          <StatTile
            href="/hr/onboarding"
            accent="onboarding"
            eyebrow="Onboarding"
            value={badges.onboarding_active}
            label="Runs in progress"
            sub="Active runs"
          />
        ) : null}
      </div>
    </section>
  );
}
