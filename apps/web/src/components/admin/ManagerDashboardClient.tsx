'use client';

import { ExperienceLensBar } from '@/components/experience/ExperienceLensBar';
import Link from 'next/link';
import { useMemo, useState } from 'react';

const statTileClass =
  'block rounded-xl border border-[#d8d8d8] bg-white px-5 py-[18px] transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_12px_rgba(0,0,0,0.04)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#121212]';

const labelRow = 'mb-2.5 flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-[0.06em] text-[#9b9b9b]';

type TimelineView = '1w' | '1m' | '3m' | '6m';

type DemoDataset = 'live' | 'demo_a' | 'demo_b';

type StaffTimelineItem = {
  id: string;
  title: string;
  date: string;
  category:
    | 'new_starter'
    | 'right_to_work'
    | 'contract'
    | 'induction'
    | 'probation'
    | 'check_in'
    | 'offer'
    | 'other';
  source: string;
  editable: boolean;
  editHref: string | null;
  completed: boolean;
  recurring: boolean;
  details: string;
};

type StaffTimelineRow = {
  userId: string;
  fullName: string;
  departmentName: string | null;
  items: StaffTimelineItem[];
};

const viewConfig: Record<TimelineView, { label: string; days: number; focus: StaffTimelineItem['category'][] }> = {
  '1w': {
    label: '1 week',
    days: 7,
    focus: ['right_to_work', 'contract', 'new_starter', 'probation', 'check_in'],
  },
  '1m': {
    label: '1 month',
    days: 30,
    focus: ['new_starter', 'right_to_work', 'probation', 'check_in', 'induction'],
  },
  '3m': {
    label: '3 months',
    days: 90,
    focus: ['probation', 'check_in', 'induction', 'contract', 'right_to_work'],
  },
  '6m': {
    label: '6 months',
    days: 180,
    focus: ['probation', 'check_in', 'contract', 'induction', 'right_to_work'],
  },
};

function categoryColor(category: StaffTimelineItem['category']) {
  switch (category) {
    case 'probation':
      return 'border-[#f59e0b] bg-amber-50 text-amber-900';
    case 'right_to_work':
      return 'border-[#ef4444] bg-rose-50 text-rose-900';
    case 'new_starter':
    case 'induction':
      return 'border-[#0ea5e9] bg-sky-50 text-sky-900';
    case 'check_in':
      return 'border-[#6366f1] bg-indigo-50 text-indigo-900';
    case 'offer':
      return 'border-[#8b5cf6] bg-violet-50 text-violet-900';
    default:
      return 'border-[#d8d8d8] bg-[#faf9f6] text-[#44403c]';
  }
}

function timelineTone(item: StaffTimelineItem, now: Date, dueSoonDays: number) {
  if (item.completed) {
    return { dot: 'bg-emerald-500', text: 'text-emerald-700', chip: 'bg-emerald-50 border-emerald-200', label: 'Completed' };
  }
  const deltaDays = Math.floor((new Date(item.date).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  if (deltaDays < 0) {
    return { dot: 'bg-rose-500', text: 'text-rose-700', chip: 'bg-rose-50 border-rose-200', label: 'Overdue' };
  }
  if (deltaDays <= dueSoonDays) {
    return { dot: 'bg-amber-500', text: 'text-amber-700', chip: 'bg-amber-50 border-amber-200', label: 'Due soon' };
  }
  if (item.recurring) {
    return { dot: 'bg-violet-500', text: 'text-violet-700', chip: 'bg-violet-50 border-violet-200', label: 'Scheduled recurring' };
  }
  if (item.category === 'probation') {
    return { dot: 'bg-teal-500', text: 'text-teal-700', chip: 'bg-teal-50 border-teal-200', label: 'Milestone/review' };
  }
  return { dot: 'bg-sky-500', text: 'text-sky-700', chip: 'bg-sky-50 border-sky-200', label: 'Upcoming' };
}

function buildDemoDatasetA(referenceDate: Date): StaffTimelineItem[] {
  const addDays = (days: number) => {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() + days);
    return d.toISOString();
  };

  return [
        { id: 'd1', title: 'New starter form due', date: addDays(2), category: 'new_starter', source: 'Onboarding', editable: true, editHref: '/admin/hr/onboarding', completed: false, recurring: false, details: 'New starter form completion needed before onboarding handover.' },
        { id: 'd2', title: 'Right to work check', date: addDays(3), category: 'right_to_work', source: 'HR Record', editable: true, editHref: '/admin/hr/me', completed: false, recurring: false, details: 'Upload and verify right-to-work evidence in HR record.' },
        { id: 'd3', title: 'Contract start', date: addDays(7), category: 'contract', source: 'HR Record', editable: true, editHref: '/admin/hr/me', completed: false, recurring: false, details: 'Contract start milestone from employment terms.' },
        { id: 'd4', title: 'Induction day (completed)', date: addDays(-2), category: 'induction', source: 'Onboarding task', editable: false, editHref: '/admin/hr/onboarding', completed: true, recurring: false, details: 'Completed induction session logged from onboarding checklist.' },
        { id: 'd5', title: '30-day probation checkpoint', date: addDays(30), category: 'probation', source: 'Probation policy', editable: true, editHref: '/admin/hr/onboarding', completed: false, recurring: false, details: 'Checkpoint generated by org probation policy window.' },
        { id: 'd6', title: '1:1 check-in', date: addDays(14), category: 'check_in', source: 'One-on-one', editable: true, editHref: '/one-on-one', completed: false, recurring: true, details: 'Recurring scheduled manager check-in.' },
        { id: 'd7', title: 'Probation review due', date: addDays(89), category: 'probation', source: 'HR Record', editable: true, editHref: '/admin/hr/me', completed: false, recurring: false, details: 'Formal probation review milestone from HR profile.' },
        { id: 'd8', title: 'Offer follow-up sent', date: addDays(1), category: 'offer', source: 'Recruitment', editable: true, editHref: '/hr/hiring', completed: false, recurring: false, details: 'Recruitment status follow-up to candidate and hiring team.' },
        { id: 'd9', title: 'ID docs verification complete', date: addDays(-1), category: 'right_to_work', source: 'HR Record', editable: false, editHref: '/admin/hr/me', completed: true, recurring: false, details: 'Passport and visa docs verified and saved in employee file.' },
        { id: 'd10', title: 'Payroll setup deadline', date: addDays(5), category: 'contract', source: 'HR Record', editable: true, editHref: '/admin/hr/me', completed: false, recurring: false, details: 'Final deadline for payroll, bank, and tax setup before start.' },
        { id: 'd11', title: 'Week 1 check-in', date: addDays(6), category: 'check_in', source: 'One-on-one', editable: true, editHref: '/one-on-one', completed: false, recurring: true, details: 'First-week recurring support check-in with manager.' },
        { id: 'd12', title: 'Week 2 check-in', date: addDays(13), category: 'check_in', source: 'One-on-one', editable: true, editHref: '/one-on-one', completed: false, recurring: true, details: 'Fortnightly recurring manager 1:1 touchpoint.' },
        { id: 'd13', title: 'Week 4 check-in', date: addDays(27), category: 'check_in', source: 'One-on-one', editable: true, editHref: '/one-on-one', completed: false, recurring: true, details: 'Monthly cadence 1:1 before probation checkpoint.' },
        { id: 'd14', title: '60-day probation checkpoint', date: addDays(60), category: 'probation', source: 'Probation policy', editable: true, editHref: '/admin/hr/onboarding', completed: false, recurring: false, details: 'Second probation checkpoint per organisation policy range.' },
        { id: 'd15', title: '90-day probation checkpoint', date: addDays(90), category: 'probation', source: 'Probation policy', editable: true, editHref: '/admin/hr/onboarding', completed: false, recurring: false, details: 'Third probation checkpoint required for final confirmation.' },
        { id: 'd16', title: '3-month review pack due', date: addDays(84), category: 'probation', source: 'HR Record', editable: true, editHref: '/admin/hr/me', completed: false, recurring: false, details: 'Manager review notes and evidence pack due before review.' },
        { id: 'd17', title: 'Performance objective check', date: addDays(45), category: 'other', source: 'Performance', editable: true, editHref: '/admin/hr/performance', completed: false, recurring: false, details: 'Mid-point objective quality check linked with probation readiness.' },
        { id: 'd18', title: 'Compliance refresher session', date: addDays(36), category: 'induction', source: 'Onboarding task', editable: true, editHref: '/admin/hr/onboarding', completed: false, recurring: false, details: 'Compliance refresher required for role-based certifications.' },
        { id: 'd19', title: 'Bi-weekly check-in', date: addDays(41), category: 'check_in', source: 'One-on-one', editable: true, editHref: '/one-on-one', completed: false, recurring: true, details: 'Auto-scheduled recurring manager meeting.' },
        { id: 'd20', title: 'Quarterly check-in', date: addDays(70), category: 'check_in', source: 'One-on-one', editable: true, editHref: '/one-on-one', completed: false, recurring: true, details: 'Quarterly recurring check-in before final probation review.' },
        { id: 'd21', title: 'Contract review reminder', date: addDays(118), category: 'contract', source: 'HR Record', editable: true, editHref: '/admin/hr/me', completed: false, recurring: false, details: 'Contract review and extension decision reminder.' },
        { id: 'd22', title: 'RTW renewal window opens', date: addDays(126), category: 'right_to_work', source: 'HR Record', editable: true, editHref: '/admin/hr/me', completed: false, recurring: false, details: 'Renewal preparation window for right-to-work documents.' },
        { id: 'd23', title: 'Manager development check', date: addDays(145), category: 'other', source: 'Performance', editable: true, editHref: '/admin/hr/performance', completed: false, recurring: false, details: '6-month capability and progression checkpoint.' },
        { id: 'd24', title: '6-month review due', date: addDays(176), category: 'probation', source: 'HR Record', editable: true, editHref: '/admin/hr/me', completed: false, recurring: false, details: 'Six-month review configured by org policy for long probation cycles.' },
        { id: 'd25', title: 'Induction documentation archived', date: addDays(20), category: 'induction', source: 'Onboarding task', editable: false, editHref: '/admin/hr/onboarding', completed: true, recurring: false, details: 'Final induction documents archived and marked complete.' },
        { id: 'd26', title: 'Monthly recurring check-in', date: addDays(98), category: 'check_in', source: 'One-on-one', editable: true, editHref: '/one-on-one', completed: false, recurring: true, details: 'Recurring monthly manager check-in continues through month 4.' },
        { id: 'd27', title: 'Monthly recurring check-in', date: addDays(154), category: 'check_in', source: 'One-on-one', editable: true, editHref: '/one-on-one', completed: false, recurring: true, details: 'Recurring monthly manager check-in in month 6 window.' },
        { id: 'd28', title: 'New starter form request: Omar Rahman', date: addDays(4), category: 'new_starter', source: 'Recruitment request form', editable: true, editHref: '/hr/hiring', completed: false, recurring: false, details: 'Hiring workflow triggered a new starter form completion request for Omar Rahman.' },
        { id: 'd29', title: 'RTW expiring soon: Priya Desai', date: addDays(9), category: 'right_to_work', source: 'HR Record', editable: true, editHref: '/admin/hr/me', completed: false, recurring: false, details: 'Right-to-work evidence for Priya Desai expires soon; renewal evidence required.' },
        { id: 'd30', title: '1:2:1 check-in: Maya Thompson', date: addDays(11), category: 'check_in', source: 'One-on-one', editable: true, editHref: '/one-on-one', completed: false, recurring: true, details: 'Scheduled manager 1:2:1 check-in with Maya Thompson from recurring cadence.' },
        { id: 'd31', title: 'Probation review due: Luca Martin', date: addDays(18), category: 'probation', source: 'HR Record', editable: true, editHref: '/admin/hr/me', completed: false, recurring: false, details: 'Luca Martin reaches policy review window; manager review notes required.' },
        { id: 'd32', title: 'Offer letter send target: Sofia Khan', date: addDays(12), category: 'offer', source: 'Recruitment request form', editable: true, editHref: '/hr/hiring', completed: false, recurring: false, details: 'Offer send deadline pulled from recruitment request SLA timeline.' },
        { id: 'd33', title: 'New starter induction booked: Ethan Cole', date: addDays(16), category: 'induction', source: 'Onboarding task', editable: true, editHref: '/admin/hr/onboarding', completed: false, recurring: false, details: 'Induction date captured from new starter onboarding checklist.' },
        { id: 'd34', title: 'RTW check completed: Aisha Patel', date: addDays(-4), category: 'right_to_work', source: 'HR Record', editable: false, editHref: '/admin/hr/me', completed: true, recurring: false, details: 'Right-to-work verification already completed and locked in employee file.' },
        { id: 'd35', title: '1:2:1 check-in: Jordan Lee', date: addDays(24), category: 'check_in', source: 'One-on-one', editable: true, editHref: '/one-on-one', completed: false, recurring: true, details: 'Recurring 1:2:1 touchpoint for Jordan Lee due this month.' },
        { id: 'd36', title: '30-day probation checkpoint: Ethan Cole', date: addDays(33), category: 'probation', source: 'Probation policy', editable: true, editHref: '/admin/hr/onboarding', completed: false, recurring: false, details: 'Automatic 30-day checkpoint created from org probation policy.' },
        { id: 'd37', title: 'Probation review due: Maya Thompson', date: addDays(58), category: 'probation', source: 'HR Record', editable: true, editHref: '/admin/hr/me', completed: false, recurring: false, details: 'Maya Thompson approaching 3-month review based on contract start date.' },
        { id: 'd38', title: 'RTW renewal due: Omar Rahman', date: addDays(75), category: 'right_to_work', source: 'HR Record', editable: true, editHref: '/admin/hr/me', completed: false, recurring: false, details: 'Renewal and document re-validation needed before expiry date.' },
        { id: 'd39', title: '1:2:1 check-in: Priya Desai', date: addDays(83), category: 'check_in', source: 'One-on-one', editable: true, editHref: '/one-on-one', completed: false, recurring: true, details: 'Recurring monthly check-in to support probation outcomes and progression.' },
        { id: 'd40', title: 'New starter form request: Noah Wright', date: addDays(95), category: 'new_starter', source: 'Recruitment request form', editable: true, editHref: '/hr/hiring', completed: false, recurring: false, details: 'New starter workflow initiated for Noah Wright after accepted offer.' },
        { id: 'd41', title: 'Contract start: Noah Wright', date: addDays(109), category: 'contract', source: 'HR Record', editable: true, editHref: '/admin/hr/me', completed: false, recurring: false, details: 'Confirmed contract start date to align onboarding and rota planning.' },
        { id: 'd42', title: '90-day probation checkpoint: Maya Thompson', date: addDays(121), category: 'probation', source: 'Probation policy', editable: true, editHref: '/admin/hr/onboarding', completed: false, recurring: false, details: 'Final policy checkpoint before probation sign-off decision.' },
        { id: 'd43', title: '1:2:1 check-in: Ethan Cole', date: addDays(133), category: 'check_in', source: 'One-on-one', editable: true, editHref: '/one-on-one', completed: false, recurring: true, details: 'Recurring check-in to evaluate onboarding adaptation and goals.' },
        { id: 'd44', title: 'Probation review due: Priya Desai', date: addDays(148), category: 'probation', source: 'HR Record', editable: true, editHref: '/admin/hr/me', completed: false, recurring: false, details: 'Scheduled 6-month review per organisation policy setting.' },
        { id: 'd45', title: 'RTW expiring soon: Jordan Lee', date: addDays(167), category: 'right_to_work', source: 'HR Record', editable: true, editHref: '/admin/hr/me', completed: false, recurring: false, details: 'RTW expiry alert for Jordan Lee requiring evidence refresh.' },
        { id: 'd46', title: '1:2:1 check-in: Noah Wright', date: addDays(172), category: 'check_in', source: 'One-on-one', editable: true, editHref: '/one-on-one', completed: false, recurring: true, details: 'First recurring 1:2:1 after Noah Wright joins the team.' },
        { id: 'd47', title: 'Probation review pack submitted: Luca Martin', date: addDays(-6), category: 'probation', source: 'HR Record', editable: false, editHref: '/admin/hr/me', completed: true, recurring: false, details: 'Review documentation submitted and approved by HR; read-only history event.' },
        { id: 'd48', title: 'Induction complete: Sofia Khan', date: addDays(-9), category: 'induction', source: 'Onboarding task', editable: false, editHref: '/admin/hr/onboarding', completed: true, recurring: false, details: 'Completed induction session and attendance logged for compliance.' },
  ];
}

function buildDemoDatasetB(referenceDate: Date): StaffTimelineItem[] {
  const addDays = (days: number) => {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() + days);
    return d.toISOString();
  };

  return [
    {
      id: 'b1',
      title: 'New starter pack request: Warehouse intake',
      date: addDays(3),
      category: 'new_starter',
      source: 'Recruitment request form',
      editable: true,
      editHref: '/hr/hiring',
      completed: false,
      recurring: false,
      details: 'Triggered when a new hire is accepted and requires starter paperwork.',
    },
    {
      id: 'b2',
      title: 'RTW audit window: team roster sample',
      date: addDays(8),
      category: 'right_to_work',
      source: 'HR Record',
      editable: true,
      editHref: '/admin/hr/me',
      completed: false,
      recurring: false,
      details: 'Spot-check RTW evidence for a rotating sample of team members.',
    },
    {
      id: 'b3',
      title: '1:2:1 series kickoff',
      date: addDays(10),
      category: 'check_in',
      source: 'One-on-one',
      editable: true,
      editHref: '/one-on-one',
      completed: false,
      recurring: true,
      details: 'Starts a recurring 1:2:1 cadence for the quarter.',
    },
    {
      id: 'b4',
      title: 'Probation mid-point review',
      date: addDays(46),
      category: 'probation',
      source: 'HR Record',
      editable: true,
      editHref: '/admin/hr/me',
      completed: false,
      recurring: false,
      details: 'Mid-point probation review aligned to policy milestones.',
    },
    {
      id: 'b5',
      title: 'Contract variation discussion',
      date: addDays(92),
      category: 'contract',
      source: 'HR Record',
      editable: true,
      editHref: '/admin/hr/me',
      completed: false,
      recurring: false,
      details: 'Review hours or role changes after probation checkpoints.',
    },
    {
      id: 'b6',
      title: 'Annual compliance refresher',
      date: addDays(160),
      category: 'induction',
      source: 'Onboarding task',
      editable: true,
      editHref: '/admin/hr/onboarding',
      completed: false,
      recurring: false,
      details: 'Scheduled compliance refresher for regulated roles.',
    },
  ];
}

function mergeDemoItemsIntoViewerRow(
  liveRows: StaffTimelineRow[],
  demoItems: StaffTimelineItem[],
  viewerUserId: string,
  viewerFullName: string,
  departmentName: string | null
): StaffTimelineRow[] {
  const prefixed = demoItems.map((i) => ({
    ...i,
    id: `demo-${i.id}`,
  }));

  const existing = liveRows.find((r) => r.userId === viewerUserId);
  if (existing) {
    const mergedItems = [...existing.items, ...prefixed].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    return liveRows.map((r) =>
      r.userId === viewerUserId ? { ...r, items: mergedItems } : r
    );
  }

  return [
    {
      userId: viewerUserId,
      fullName: viewerFullName,
      departmentName,
      items: prefixed,
    },
  ];
}

function resolveTimelineRows(
  demoDataset: DemoDataset,
  liveRows: StaffTimelineRow[],
  viewerUserId: string,
  viewerFullName: string,
  departmentName: string | null,
  referenceDate: Date
): StaffTimelineRow[] {
  if (demoDataset === 'demo_a') {
    return mergeDemoItemsIntoViewerRow(
      liveRows,
      buildDemoDatasetA(referenceDate),
      viewerUserId,
      viewerFullName,
      departmentName
    );
  }
  if (demoDataset === 'demo_b') {
    return mergeDemoItemsIntoViewerRow(
      liveRows,
      buildDemoDatasetB(referenceDate),
      viewerUserId,
      viewerFullName,
      departmentName
    );
  }
  return liveRows.length > 0
    ? liveRows
    : [
        {
          userId: viewerUserId,
          fullName: viewerFullName,
          departmentName,
          items: buildDemoDatasetA(referenceDate),
        },
      ];
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export function ManagerDashboardClient({
  stats,
  hasDepartments,
  departmentNames,
  upcomingItems,
  departmentBreakdown,
  staffTimelineRows,
  viewerUserId,
  viewerFullName,
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
  staffTimelineRows: StaffTimelineRow[];
  viewerUserId: string;
  viewerFullName: string;
}) {
  const [upcomingLens, setUpcomingLens] = useState<'list' | 'board'>('list');
  const [timelineView, setTimelineView] = useState<TimelineView>('1m');
  const [demoDataset, setDemoDataset] = useState<DemoDataset>('live');
  const [selectedTimelineItem, setSelectedTimelineItem] = useState<
    (StaffTimelineItem & { personName: string; toneLabel: string }) | null
  >(null);

  const upcomingBoard = useMemo(() => {
    const events = upcomingItems.filter((i) => i.kind !== 'shift');
    const shifts = upcomingItems.filter((i) => i.kind === 'shift');
    return { events, shifts };
  }, [upcomingItems]);

  const timelineModel = useMemo(() => {
    const now = new Date();
    const msInDay = 24 * 60 * 60 * 1000;
    const horizonDays = viewConfig[timelineView].days;
    const end = new Date(now.getTime() + horizonDays * msInDay);
    const focusOrder = viewConfig[timelineView].focus;
    const focusRank = new Map(focusOrder.map((k, i) => [k, i]));

    const deptLabel = departmentNames.length ? departmentNames.join(', ') : null;
    const sourceRows = resolveTimelineRows(demoDataset, staffTimelineRows, viewerUserId, viewerFullName, deptLabel, now);

    const inRangeRows = sourceRows
      .map((row) => {
        const scopedItems = row.items.filter((item) => {
          const d = new Date(item.date);
          return d >= now && d <= end;
        });
        return { ...row, scopedItems };
      })
      .filter((row) => row.scopedItems.length > 0);

    const hasLiveRows = staffTimelineRows.length > 0;
    const fallbackRows =
      inRangeRows.length > 0
        ? inRangeRows
        : sourceRows
            .map((row) => {
              // If the selected range is empty, show nearest items (upcoming first, then recent past)
              // so managers never see a blank timeline.
              const sortedByDistance = [...row.items].sort((a, b) => {
                const aDelta = new Date(a.date).getTime() - now.getTime();
                const bDelta = new Date(b.date).getTime() - now.getTime();
                const aDistance = aDelta >= 0 ? aDelta : Math.abs(aDelta) + msInDay * 30;
                const bDistance = bDelta >= 0 ? bDelta : Math.abs(bDelta) + msInDay * 30;
                return aDistance - bDistance;
              });
              return { ...row, scopedItems: sortedByDistance.slice(0, 4) };
            })
            .filter((row) => row.scopedItems.length > 0);

    const rows = fallbackRows;

    const topItems = rows
      .flatMap((row) => row.scopedItems.map((item) => ({ ...item, person: row.fullName })))
      .sort((a, b) => {
        const aRank = focusRank.get(a.category) ?? 999;
        const bRank = focusRank.get(b.category) ?? 999;
        if (aRank !== bRank) return aRank - bRank;
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      })
      .slice(0, 6);

    return {
      rows,
      topItems,
      now,
      end,
      showSyntheticPreviewBanner: !hasLiveRows,
      showDemoOverlayBanner: demoDataset !== 'live',
      isRangeFallback: inRangeRows.length === 0 && fallbackRows.length > 0,
      demoDataset,
    };
  }, [staffTimelineRows, timelineView, demoDataset, departmentNames, viewerUserId, viewerFullName]);

  const timelineGrid = useMemo(() => {
    const horizonDays = viewConfig[timelineView].days;
    // Keep the visual board size stable across 1W/1M/3M/6M.
    // We only change the day-step granularity per column.
    const columns = 14;
    const dayStep = Math.max(1, Math.ceil(horizonDays / columns));
    const axisStart = startOfDay(timelineModel.now);
    const axisEnd = addDays(axisStart, horizonDays);
    const msPerCol = dayStep * 24 * 60 * 60 * 1000;

    const ticks = Array.from({ length: columns + 1 }, (_, idx) => {
      const at = addDays(axisStart, idx * dayStep);
      return {
        key: `tick-${idx}`,
        label: at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      };
    });

    const rows = timelineModel.rows.map((row) => {
      const basePoints = row.scopedItems.map((item) => {
        const at = startOfDay(new Date(item.date));
        const left = ((at.getTime() - axisStart.getTime()) / (axisEnd.getTime() - axisStart.getTime())) * 100;
        return {
          ...item,
          leftPercent: Math.max(1, Math.min(99, left)),
        };
      });

      // Auto-assign lanes so nearby items don't overlap labels.
      const laneLastLeft: number[] = [];
      const minGapPercent = 14;
      const points = [...basePoints]
        .sort((a, b) => a.leftPercent - b.leftPercent)
        .map((point) => {
          let lane = laneLastLeft.findIndex((last) => point.leftPercent - last >= minGapPercent);
          if (lane === -1) {
            lane = laneLastLeft.length;
            laneLastLeft.push(point.leftPercent);
          } else {
            laneLastLeft[lane] = point.leftPercent;
          }
          return { ...point, lane };
        });

      const laneCount = Math.max(1, laneLastLeft.length);
      return { ...row, points, laneCount };
    });

    return { ticks, rows, columns, msPerCol };
  }, [timelineModel.now, timelineModel.rows, timelineView]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-authSerif text-[22px] tracking-tight text-[#121212]">Manager dashboard</h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          Department overview and activity for your assigned teams.
        </p>
      </header>

      <section className="overflow-hidden rounded-xl border border-[#d8d8d8] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d8d8d8] px-5 py-4">
          <div>
            <h2 className="font-authSerif text-[18px] tracking-tight text-[#121212]">Your timeline overview</h2>
            <p className="mt-0.5 text-xs text-[#6b6b6b]">
              Cross-HRIS milestones for your upcoming actions and dates.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ExperienceLensBar
              ariaLabel="Timeline dataset"
              value={demoDataset}
              onChange={(v) => setDemoDataset(v as DemoDataset)}
              choices={[
                { value: 'live', label: 'Live' },
                { value: 'demo_a', label: 'Demo A' },
                { value: 'demo_b', label: 'Demo B' },
              ]}
            />
            <ExperienceLensBar
              ariaLabel="Timeline range"
              value={timelineView}
              onChange={(v) => setTimelineView(v as TimelineView)}
              choices={[
                { value: '1w', label: '1W' },
                { value: '1m', label: '1M' },
                { value: '3m', label: '3M' },
                { value: '6m', label: '6M' },
              ]}
            />
          </div>
        </div>

        {timelineModel.showDemoOverlayBanner ? (
          <div className="border-b border-[#ede9fe] bg-[#f5f3ff] px-5 py-2.5 text-[12px] text-[#4c1d95]">
            Demo overlay enabled — extra preview tasks are merged into your timeline (live items remain unless cleared).
          </div>
        ) : null}

        {timelineModel.showSyntheticPreviewBanner ? (
          <div className="border-b border-[#bfdbfe] bg-[#eff6ff] px-5 py-2.5 text-[12px] text-[#1e3a8a]">
            No live timeline rows returned yet — showing built-in preview datasets. Switch “Timeline dataset” to Demo A/B or ensure HRIS dates exist for your profile.
          </div>
        ) : null}

        {timelineModel.isRangeFallback ? (
          <div className="border-b border-[#fef3c7] bg-[#fffbeb] px-5 py-2.5 text-[12px] text-[#92400e]">
            No items matched this exact range — showing the nearest upcoming/recent items instead.
          </div>
        ) : null}

        <div className="border-b border-[#ececec] bg-[#faf9f6] px-5 py-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8b8b8b]">
            Top priorities for {viewConfig[timelineView].label}
          </p>
          {timelineModel.topItems.length === 0 ? (
            <p className="text-sm text-[#9b9b9b]">No high-priority items inside this timeline window.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {timelineModel.topItems.map((item) => (
                <div
                  key={`${item.person}-${item.id}`}
                  className={`rounded-md border px-2.5 py-1.5 text-[11.5px] ${categoryColor(item.category)}`}
                >
                  <p className="font-medium">
                    {item.person}: {item.title}
                  </p>
                  <p className="mt-0.5 opacity-80">
                    {new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ·{' '}
                    {item.source}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-4">
          {timelineGrid.rows.length === 0 ? (
            <p className="text-sm text-[#9b9b9b]">No staff timeline items inside the selected range yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[980px] rounded-lg border border-[#e7e5e4] bg-white">
                <div
                  className="grid border-b border-[#ececec] bg-[#faf9f6]"
                  style={{ gridTemplateColumns: `220px repeat(${timelineGrid.ticks.length}, minmax(56px, 1fr))` }}
                >
                  <div className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8b8b8b]">
                    You
                  </div>
                  {timelineGrid.ticks.map((tick) => (
                    <div key={tick.key} className="border-l border-[#efefef] px-2 py-2.5 text-[11px] text-[#8b8b8b]">
                      {tick.label}
                    </div>
                  ))}
                </div>

                {timelineGrid.rows.map((row) => (
                  <div
                    key={row.userId}
                    className="grid border-b border-[#f1f1f1] last:border-b-0"
                    style={{ gridTemplateColumns: `220px repeat(${timelineGrid.ticks.length}, minmax(56px, 1fr))` }}
                  >
                    <div className="px-3 py-3">
                      <p className="text-[13px] font-medium text-[#121212]">{row.fullName}</p>
                      <p className="text-[11px] text-[#8b8b8b]">{row.departmentName ?? 'Department not set'}</p>
                    </div>

                    <div
                      className="relative col-span-full ml-[220px] border-l border-[#f0f0f0]"
                      style={{ height: `${Math.max(96, row.laneCount * 34 + 42)}px` }}
                    >
                      <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${timelineGrid.ticks.length}, minmax(56px, 1fr))` }}>
                        {timelineGrid.ticks.map((tick) => (
                          <div key={`${row.userId}-${tick.key}`} className="border-r border-[#f8f8f8]" />
                        ))}
                      </div>

                      <div className="absolute left-0 right-0 top-[58%] h-[2px] -translate-y-1/2 bg-[#d8d8d8]" />

                      {row.points.map((point) => {
                        const tone = timelineTone(point, timelineModel.now, Math.max(2, Math.ceil(viewConfig[timelineView].days / 5)));
                        const top = 8 + point.lane * 34;
                        return (
                          <button
                            key={point.id}
                            type="button"
                            className={`absolute z-10 w-[190px] -translate-x-1/2 text-left ${tone.text}`}
                            style={{ left: `${point.leftPercent}%`, top: `${top}px` }}
                            onClick={() =>
                              setSelectedTimelineItem({
                                ...point,
                                personName: row.fullName,
                                toneLabel: tone.label,
                              })
                            }
                            title={`${point.title} · ${point.source}`}
                          >
                            <span className={`absolute left-1/2 h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-white shadow ${tone.dot}`} style={{ top: `${Math.max(24, row.laneCount * 34 + 6 - top)}px` }} />
                            <span className="block truncate text-[11px] font-medium underline-offset-2 hover:underline">
                              {point.title}
                            </span>
                            <span className="mt-0.5 block text-[10px] opacity-80">
                              {new Date(point.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {selectedTimelineItem ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-xl border border-[#d8d8d8] bg-white p-4 shadow-xl">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-authSerif text-[18px] text-[#121212]">{selectedTimelineItem.title}</h3>
                  <p className="text-xs text-[#6b6b6b]">{selectedTimelineItem.personName}</p>
                </div>
                <button
                  type="button"
                  className="rounded-md border border-[#d8d8d8] px-2 py-1 text-xs text-[#44403c] hover:bg-[#faf9f6]"
                  onClick={() => setSelectedTimelineItem(null)}
                >
                  Close
                </button>
              </div>

              <div className={`mb-3 rounded-md border px-2.5 py-1.5 text-[11px] ${timelineTone(selectedTimelineItem, timelineModel.now, Math.max(2, Math.ceil(viewConfig[timelineView].days / 5))).chip}`}>
                {timelineTone(selectedTimelineItem, timelineModel.now, Math.max(2, Math.ceil(viewConfig[timelineView].days / 5))).label}
              </div>

              <div className="space-y-2 text-[12px] text-[#44403c]">
                <p>
                  <span className="font-medium text-[#121212]">Date:</span>{' '}
                  {new Date(selectedTimelineItem.date).toLocaleString()}
                </p>
                <p>
                  <span className="font-medium text-[#121212]">Source:</span> {selectedTimelineItem.source}
                </p>
                <p>{selectedTimelineItem.details}</p>
                {selectedTimelineItem.editable ? (
                  <p className="rounded-md border border-[#bbf7d0] bg-[#f0fdf4] px-2.5 py-1.5 text-[11px] text-[#166534]">
                    ✎ Editable — changes sync to database
                  </p>
                ) : (
                  <p className="rounded-md border border-[#e5e7eb] bg-[#f8fafc] px-2.5 py-1.5 text-[11px] text-[#475569]">
                    Read-only event
                  </p>
                )}
              </div>

              {selectedTimelineItem.editHref ? (
                <div className="mt-4">
                  <Link
                    href={selectedTimelineItem.editHref}
                    className="inline-flex h-9 items-center rounded-lg border border-[#121212] px-3 text-[12px] font-medium text-[#121212] hover:bg-[#f5f4f1]"
                  >
                    Open source record
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

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
