'use client';

import type { ShellBadgeCounts } from '@/lib/shell/shellBadgeCounts';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type HrOverviewStats = {
  liveJobs: number | null;
  draftJobs: number | null;
  applications: number | null;
  applicationsWeek: number | null;
  activeMembers: number | null;
  upcomingInterviewSlots: number | null;
};

type OverviewRow = {
  href: string;
  group: 'Hiring & jobs' | 'Schedule & org' | 'Alerts';
  eyebrow: string;
  value: number | string;
  label: string;
  sub: string;
  status: string;
  statusTone: 'blue' | 'green' | 'amber' | 'stone';
  order: number;
};

const STATUS_TONE_CLASS: Record<OverviewRow['statusTone'], string> = {
  blue: 'bg-[#e8f1fb] text-[#1f5da8]',
  green: 'bg-[#edf5e3] text-[#4d7f20]',
  amber: 'bg-[#f8ecd9] text-[#9c6513]',
  stone: 'bg-[#f1eee8] text-[#66635d]',
};

function countDisplay(value: number | null | undefined, loading: boolean): number | string {
  if (typeof value === 'number') return value;
  return loading ? '...' : '-';
}

function OverviewSection({
  title,
  rows,
}: {
  title: OverviewRow['group'];
  rows: OverviewRow[];
}) {
  return (
    <section aria-labelledby={`people-group-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} className="mt-10 first:mt-0">
      <h2
        id={`people-group-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
        className="border-b border-[#e8e8e8] pb-3 text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]"
      >
        {title}
      </h2>
      <div>
        {rows.map((row) => (
          <Link
            key={`${title}-${row.eyebrow}-${row.label}`}
            href={row.href}
            prefetch={false}
            className="group grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-4 border-b border-[#f0f0f0] py-7 transition-colors hover:bg-[#fafaf9] sm:grid-cols-[96px_minmax(0,1fr)_170px] sm:gap-6"
          >
            <div className="text-[40px] font-semibold leading-none tracking-[-0.04em] text-[#121212] tabular-nums sm:text-[52px]">
              {row.value}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">{row.eyebrow}</p>
              <p className="mt-2 text-[13px] font-semibold leading-snug text-[#121212] sm:text-[14px]">
                {row.label}
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-[#6b6b6b] sm:text-[13px]">{row.sub}</p>
            </div>
            <div className="flex items-center justify-end gap-4 self-center">
              <span
                className={[
                  'inline-flex min-h-[30px] min-w-[96px] items-center justify-center rounded-md px-3 text-[11px] font-semibold uppercase tracking-wide sm:min-w-[108px]',
                  STATUS_TONE_CLASS[row.statusTone],
                ].join(' ')}
              >
                {row.status}
              </span>
              <span className="text-[22px] leading-none text-[#8a857d] transition-transform group-hover:translate-x-1" aria-hidden>
                →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
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

  const rows = useMemo<OverviewRow[]>(() => {
    const allRows: OverviewRow[] = [];

    if (canViewApplications) {
      const recentApplications =
        typeof counts?.applicationsWeek === 'number' && counts.applicationsWeek > 0
          ? `${counts.applicationsWeek} new in the last 7 days`
          : badges.application_notifications > 0
            ? `${badges.application_notifications} unread update${badges.application_notifications === 1 ? '' : 's'}`
            : countsLoading
              ? 'Loading recent applications'
              : 'All stages';
      allRows.push({
        href: '/hr/applications',
        group: 'Hiring & jobs',
        eyebrow: 'Applicants',
        value: countDisplay(counts?.applications, countsLoading),
        label: 'Across all open roles',
        sub: recentApplications,
        status: 'Active',
        statusTone: 'blue',
        order: 10,
      });
    }

    if (canRecruitment || canCreateRequest) {
      allRows.push({
        href: '/hr/hiring/requests',
        group: 'Hiring & jobs',
        eyebrow: 'Hiring',
        value: badges.recruitment_pending_review,
        label: 'Requests awaiting review',
        sub:
          badges.recruitment_notifications > 0
            ? `${badges.recruitment_notifications} unread recruitment update${badges.recruitment_notifications === 1 ? '' : 's'}`
            : badges.recruitment_pending_review === 0
              ? 'Nothing waiting in the queue'
              : 'Needs your attention',
        status: badges.recruitment_pending_review > 0 ? 'Pending' : 'Clear',
        statusTone: badges.recruitment_pending_review > 0 ? 'amber' : 'stone',
        order: 20,
      });
    }

    if (canViewJobs) {
      allRows.push({
        href: '/hr/jobs',
        group: 'Hiring & jobs',
        eyebrow: 'Jobs',
        value: countDisplay(counts?.liveJobs, countsLoading),
        label: 'Live listings',
        sub: countsLoading && counts?.liveJobs == null ? 'Loading published roles' : 'Published and active roles',
        status: 'Published',
        statusTone: 'green',
        order: 30,
      });
      allRows.push({
        href: '/hr/jobs',
        group: 'Hiring & jobs',
        eyebrow: 'Jobs',
        value: countDisplay(counts?.draftJobs, countsLoading),
        label: 'Draft listings',
        sub: countsLoading && counts?.draftJobs == null ? 'Loading unpublished roles' : 'Not yet published',
        status: 'Draft',
        statusTone: 'stone',
        order: 40,
      });
    }

    if (canViewInterviews) {
      allRows.push({
        href: '/hr/interviews',
        group: 'Schedule & org',
        eyebrow: 'Schedule',
        value: countDisplay(counts?.upcomingInterviewSlots, countsLoading),
        label: 'Interview slots in next 14 days',
        sub: countsLoading && counts?.upcomingInterviewSlots == null ? 'Loading schedule' : 'Available and booked',
        status: 'Upcoming',
        statusTone: 'blue',
        order: 50,
      });
    }

    if (canViewAllRecords) {
      allRows.push({
        href: '/hr/records',
        group: 'Schedule & org',
        eyebrow: 'Directory',
        value: countDisplay(counts?.activeMembers, countsLoading),
        label: 'Active people in your org',
        sub: countsLoading && counts?.activeMembers == null ? 'Loading member count' : 'Search and HR files',
        status: 'Active',
        statusTone: 'green',
        order: 60,
      });
    } else if (canViewTeamRecords) {
      allRows.push({
        href: '/hr/records',
        group: 'Schedule & org',
        eyebrow: 'Directory',
        value: '-',
        label: 'Team HR records',
        sub: "Your team's files",
        status: 'Active',
        statusTone: 'green',
        order: 60,
      });
    }

    if (canViewMetricAlerts) {
      allRows.push({
        href: '/hr/hr-metric-alerts',
        group: 'Alerts',
        eyebrow: 'Alerts',
        value: badges.hr_metric_notifications,
        label: 'HR metric notifications',
        sub: badges.hr_metric_notifications === 0 ? 'Inbox clear' : 'Unread items',
        status: badges.hr_metric_notifications === 0 ? 'All clear' : 'Unread',
        statusTone: badges.hr_metric_notifications === 0 ? 'green' : 'amber',
        order: 70,
      });
    }

    if (canViewOnboarding && badges.onboarding_active > 0) {
      allRows.push({
        href: '/hr/onboarding',
        group: 'Alerts',
        eyebrow: 'Onboarding',
        value: badges.onboarding_active,
        label: 'Runs in progress',
        sub: 'Active runs',
        status: 'Active',
        statusTone: 'blue',
        order: 80,
      });
    }

    return allRows.sort((a, b) => a.order - b.order);
  }, [
    badges.application_notifications,
    badges.hr_metric_notifications,
    badges.onboarding_active,
    badges.recruitment_notifications,
    badges.recruitment_pending_review,
    canCreateRequest,
    canRecruitment,
    canViewAllRecords,
    canViewApplications,
    canViewInterviews,
    canViewJobs,
    canViewMetricAlerts,
    canViewOnboarding,
    canViewTeamRecords,
    counts?.activeMembers,
    counts?.applications,
    counts?.applicationsWeek,
    counts?.draftJobs,
    counts?.liveJobs,
    counts?.upcomingInterviewSlots,
    countsLoading,
  ]);

  const groupedRows = useMemo(
    () =>
      (['Hiring & jobs', 'Schedule & org', 'Alerts'] as const)
        .map((group) => ({ group, rows: rows.filter((row) => row.group === group) }))
        .filter((section) => section.rows.length > 0),
    [rows]
  );

  return (
    <section className="mt-8" aria-labelledby="people-snapshot-heading">
      <h2 id="people-snapshot-heading" className="sr-only">
        People overview
      </h2>
      {groupedRows.map((section) => (
        <OverviewSection key={section.group} title={section.group} rows={section.rows} />
      ))}
    </section>
  );
}
