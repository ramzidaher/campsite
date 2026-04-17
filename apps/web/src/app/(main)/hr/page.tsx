import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getMainShellHrNavItemsByPermissions } from '@/lib/adminGates';
import { parseShellBadgeCounts } from '@/lib/shell/shellBadgeCounts';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { createClient } from '@/lib/supabase/server';

type SnapshotAccent =
  | 'hiring'
  | 'jobsLive'
  | 'jobsDraft'
  | 'applicants'
  | 'schedule'
  | 'directory'
  | 'alerts'
  | 'onboarding';

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

/** Snapshot cards: same type scale as `LeaveHubClient` body; serif reserved for the page title only. */
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
          View details →
        </span>
      </div>
    </Link>
  );
}

export default async function HrOverviewPage() {
  const bundle = await getCachedMainShellLayoutBundle();
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');

  const permissionKeys = parseShellPermissionKeys(bundle);
  if (!getMainShellHrNavItemsByPermissions(permissionKeys)?.length) redirect('/broadcasts');

  const supabase = await createClient();
  const badges = parseShellBadgeCounts(bundle);
  const pendingRecruitment = badges.recruitment_pending_review;
  const recruitmentNotif = badges.recruitment_notifications;
  const applicationNotif = badges.application_notifications;
  const hrMetricNotif = badges.hr_metric_notifications;
  const onboardingActive = badges.onboarding_active;

  const p = permissionKeys;
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoIso = weekAgo.toISOString();

  const fetches: Array<Promise<{ key: string; value: number }>> = [];

  if (p.includes('jobs.view')) {
    fetches.push(
      (async () => {
        const { count } = await supabase
          .from('job_listings')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .eq('status', 'live');
        return { key: 'liveJobs', value: count ?? 0 };
      })()
    );
    fetches.push(
      (async () => {
        const { count } = await supabase
          .from('job_listings')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .eq('status', 'draft');
        return { key: 'draftJobs', value: count ?? 0 };
      })()
    );
  }
  if (p.includes('applications.view')) {
    fetches.push(
      (async () => {
        const { count } = await supabase
          .from('job_applications')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId);
        return { key: 'applications', value: count ?? 0 };
      })()
    );
    fetches.push(
      (async () => {
        const { count } = await supabase
          .from('job_applications')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .gte('created_at', weekAgoIso);
        return { key: 'applicationsWeek', value: count ?? 0 };
      })()
    );
  }

  if (p.includes('hr.view_records')) {
    fetches.push(
      (async () => {
        const { count } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .eq('status', 'active');
        return { key: 'activeMembers', value: count ?? 0 };
      })()
    );
  }

  if (p.includes('interviews.view') || p.includes('interviews.book_slot')) {
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 14);
    const horizonIso = horizon.toISOString();
    fetches.push(
      (async () => {
        const { count } = await supabase
          .from('interview_slots')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .gte('starts_at', new Date().toISOString())
          .lte('starts_at', horizonIso)
          .in('status', ['available', 'booked']);
        return { key: 'upcomingInterviewSlots', value: count ?? 0 };
      })()
    );
  }

  const counts: Record<string, number> = {};
  const results = await Promise.all(fetches);
  for (const r of results) {
    if (r) counts[r.key] = r.value;
  }

  const canRecruitment =
    p.includes('recruitment.view') || p.includes('recruitment.manage') || p.includes('recruitment.approve_request');
  const canCreateRequest = p.includes('recruitment.create_request');
  const showRecruitmentTile = canRecruitment || canCreateRequest;

  return (
    <div className="font-sans text-[#121212]">
      <div className="mb-7">
        <h1 className="font-authSerif text-[28px] leading-tight tracking-[-0.03em] text-[#121212]">People</h1>
        <p className="mt-1 max-w-2xl text-[13.5px] text-[#6b6b6b]">
          Hiring and people metrics at a glance — same type styles as Time off. Open a card to jump in; use{' '}
          <Link href="/leave" className="font-medium text-[#121212] underline-offset-2 hover:underline">
            Time off
          </Link>{' '}
          for balances and requests.
        </p>
      </div>

      <section className="mt-2" aria-labelledby="people-snapshot-heading">
        <h2 id="people-snapshot-heading" className="mb-3 text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">
          Snapshot
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {showRecruitmentTile ? (
            <StatTile
              href="/hr/hiring/requests"
              accent="hiring"
              eyebrow="Hiring"
              value={pendingRecruitment}
              label="Requests awaiting review"
              sub={
                recruitmentNotif > 0
                  ? `${recruitmentNotif} unread recruitment update${recruitmentNotif === 1 ? '' : 's'}`
                  : pendingRecruitment === 0
                    ? 'Nothing waiting in the queue'
                    : undefined
              }
            />
          ) : null}

          {p.includes('jobs.view') ? (
            <>
              <StatTile
                href="/hr/jobs"
                accent="jobsLive"
                eyebrow="Jobs"
                value={counts.liveJobs ?? 0}
                label="Live listings"
                sub="Published roles"
              />
              <StatTile
                href="/hr/jobs"
                accent="jobsDraft"
                eyebrow="Jobs"
                value={counts.draftJobs ?? 0}
                label="Draft listings"
                sub="Not yet published"
              />
            </>
          ) : null}

          {p.includes('applications.view') ? (
            <StatTile
              href="/hr/applications"
              accent="applicants"
              eyebrow="Applicants"
              value={counts.applications ?? 0}
              label="Across all open roles"
              sub={
                counts.applicationsWeek != null && counts.applicationsWeek > 0
                  ? `${counts.applicationsWeek} new in the last 7 days`
                  : applicationNotif > 0
                    ? `${applicationNotif} unread update${applicationNotif === 1 ? '' : 's'}`
                    : 'All stages'
              }
            />
          ) : null}

          {p.includes('interviews.view') || p.includes('interviews.book_slot') ? (
            <StatTile
              href="/hr/interviews"
              accent="schedule"
              eyebrow="Schedule"
              value={counts.upcomingInterviewSlots ?? 0}
              label="Interview slots (14 days)"
              sub="Available and booked"
            />
          ) : null}

          {p.includes('hr.view_records') ? (
            <StatTile
              href="/hr/records"
              accent="directory"
              eyebrow="Directory"
              value={counts.activeMembers ?? 0}
              label="Active people in your org"
              sub="Search and HR files"
            />
          ) : p.includes('hr.view_direct_reports') ? (
            <StatTile
              href="/hr/records"
              accent="directory"
              eyebrow="Directory"
              value="—"
              label="Team HR records"
              sub="Your team’s files"
            />
          ) : null}

          {p.includes('hr.view_records') ? (
            <StatTile
              href="/hr/hr-metric-alerts"
              accent="alerts"
              eyebrow="Alerts"
              value={hrMetricNotif}
              label="HR metric notifications"
              sub={hrMetricNotif === 0 ? 'Inbox clear' : 'Unread items'}
            />
          ) : null}

          {(p.includes('onboarding.manage_runs') ||
            p.includes('onboarding.manage_templates') ||
            p.includes('onboarding.complete_own_tasks')) &&
          onboardingActive > 0 ? (
            <StatTile
              href="/hr/onboarding"
              accent="onboarding"
              eyebrow="Onboarding"
              value={onboardingActive}
              label="Runs in progress"
              sub="Active runs"
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}
