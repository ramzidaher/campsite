'use client';

import { useShellRefresh } from '@/hooks/useShellRefresh';
import { queueEntityCalendarSync } from '@/lib/calendar/queueEntityCalendarSync';
import {
  calendarYmdInTimeZone,
  currentLeaveYearKeyForOrgCalendar,
  currentLeaveYearKeyUtc,
  formatLeaveYearPeriodRange,
} from '@/lib/datetime';
import { leaveRangeOverlapsExisting } from '@/lib/leaveDateOverlap';
import { formatToilMinutes, toilInputToMinutes } from '@/lib/toilDuration';
import { countOrgLeaveDaysInclusive, overlapInclusiveRange, type OrgLeaveDayOptions } from '@/lib/workingDays';
import { invalidateClientCaches } from '@/lib/cache/clientInvalidate';
import { createClient } from '@/lib/supabase/client';
import { CampfireLoaderInline } from '@/components/CampfireLoaderInline';
import { Calendar, ChevronDown, Info } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

type LeaveRequest = {
  id: string;
  kind: string;
  start_date: string;
  end_date: string;
  half_day_portion?: 'am' | 'pm' | null;
  parental_subtype?: 'maternity' | 'paternity' | 'adoption' | 'shared_parental' | null;
  status: string;
  note: string | null;
  decision_note?: string | null;
  created_at: string;
  decided_at?: string | null;
  requested_action_at?: string | null;
  proposed_kind?: string | null;
  proposed_start_date?: string | null;
  proposed_end_date?: string | null;
  proposed_note?: string | null;
  proposed_half_day_portion?: 'am' | 'pm' | null;
  proposed_parental_subtype?: 'maternity' | 'paternity' | 'adoption' | 'shared_parental' | null;
  requester_id?: string;
  profiles?: { full_name: string } | { full_name: string }[] | null;
};

type SicknessRow = {
  id: string;
  start_date: string;
  end_date: string;
  half_day_portion?: 'am' | 'pm' | null;
  notes: string | null;
};

type AllowanceRow = {
  leave_year: string;
  annual_entitlement_days: number;
  toil_balance_days: number;
};

type ToilCreditRequest = {
  id: string;
  work_date: string;
  minutes_earned: number;
  note: string | null;
  status: string;
  decision_note?: string | null;
  created_at: string;
  requester_id?: string;
  profiles?: { full_name: string } | { full_name: string }[] | null;
};

type CarryoverRequest = {
  id: string;
  from_leave_year: string;
  to_leave_year: string;
  days_requested: number;
  days_approved?: number | null;
  note: string | null;
  status: string;
  decision_note?: string | null;
  created_at: string;
  requester_id?: string;
  profiles?: { full_name: string } | { full_name: string }[] | null;
};

type EncashmentRequest = {
  id: string;
  leave_year: string;
  days_requested: number;
  days_approved?: number | null;
  note: string | null;
  status: string;
  decision_note?: string | null;
  created_at: string;
  requester_id?: string;
  profiles?: { full_name: string } | { full_name: string }[] | null;
};

type HolidayPeriod = {
  id: string;
  name: string;
  holiday_kind: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
};

type LeaveRequestDocument = {
  id: string;
  request_id: string;
  document_kind: 'fit_note' | 'medical_letter' | 'adoption_document' | 'bereavement_evidence' | 'other';
  file_name: string;
  storage_path: string;
};

type TeamAbsence = {
  id: string;
  requester_id: string;
  requester_name: string;
  kind: string;
  start_date: string;
  end_date: string;
  half_day_portion?: 'am' | 'pm' | null;
  /** Departments this person belongs to (for manager calendar filter). */
  dept_ids: string[];
};

const REQUESTABLE_LEAVE_KINDS = ['annual', 'toil', 'parental', 'bereavement', 'compassionate', 'study', 'unpaid'] as const;
type RequestableLeaveKind = (typeof REQUESTABLE_LEAVE_KINDS)[number];
type ParentalSubtype = 'maternity' | 'paternity' | 'adoption' | 'shared_parental';
const SUPPORTING_DOC_LEAVE_KINDS: RequestableLeaveKind[] = ['parental', 'bereavement', 'compassionate'];

function leaveKindLabel(kind: string): string {
  switch (kind) {
    case 'annual': return 'Annual leave';
    case 'toil': return 'Time off in lieu (TOIL)';
    case 'parental': return 'Parental leave';
    case 'bereavement': return 'Bereavement leave';
    case 'compassionate': return 'Compassionate leave';
    case 'study': return 'Study leave';
    case 'unpaid': return 'Unpaid leave';
    default: return kind;
  }
}

function leaveKindShortLabel(kind: string): string {
  switch (kind) {
    case 'annual': return 'Annual';
    case 'toil': return 'TOIL';
    case 'parental': return 'Parental';
    case 'bereavement': return 'Bereavement';
    case 'compassionate': return 'Compassionate';
    case 'study': return 'Study';
    case 'unpaid': return 'Unpaid';
    default: return kind;
  }
}

function leaveKindBookingHint(kind: string): string | null {
  switch (kind) {
    case 'annual':
      return 'Uses your annual leave entitlement for this leave year.';
    case 'toil':
      return 'Deducts from your TOIL balance once approved.';
    case 'parental':
      return 'Parental leave — manager approval required.';
    case 'bereavement':
      return 'Bereavement leave — manager approval required.';
    case 'compassionate':
      return 'Compassionate leave — manager approval required.';
    case 'study':
      return 'Study leave — manager approval may be required.';
    case 'unpaid':
      return 'Unpaid leave — manager approval required.';
    default:
      return null;
  }
}

const BOOK_LEAVE_KIND_ORDER: RequestableLeaveKind[] = ['annual', 'toil', 'parental', 'bereavement', 'compassionate', 'study', 'unpaid'];

function parentalSubtypeLabel(v: ParentalSubtype | string | null | undefined): string {
  switch (v) {
    case 'maternity': return 'Maternity';
    case 'paternity': return 'Paternity';
    case 'adoption': return 'Adoption';
    case 'shared_parental': return 'Shared parental';
    default: return '';
  }
}

function supportingDocKindLabel(kind: LeaveRequestDocument['document_kind']): string {
  switch (kind) {
    case 'fit_note': return 'Fit note';
    case 'medical_letter': return 'Medical letter';
    case 'adoption_document': return 'Adoption document';
    case 'bereavement_evidence': return 'Bereavement evidence';
    default: return 'Supporting document';
  }
}

function daysBetween(start: string, end: string): number {
  const a = new Date(`${start}T12:00:00Z`);
  const b = new Date(`${end}T12:00:00Z`);
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

function daysLabel(start: string, end: string): string {
  const n = daysBetween(start, end);
  return `${n} day${n === 1 ? '' : 's'}`;
}

/** Count only approved (or still-approved pending-change) leave against usage. */
function annualCountsTowardUsage(status: string): boolean {
  return status === 'approved' || status === 'pending_edit' || status === 'pending_cancel';
}

function leaveRequestOverlapsLeaveYear(
  r: Pick<LeaveRequest, 'start_date' | 'end_date'>,
  leaveYearStartIso: string,
  leaveYearEndIso: string,
): boolean {
  return Boolean(overlapInclusiveRange(r.start_date, r.end_date, leaveYearStartIso, leaveYearEndIso));
}

function fmtDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function monthKeyToRange(monthKey: string): { start: string; end: string } {
  const [y, m] = monthKey.split('-').map(Number);
  const start = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`;
  const endDate = new Date(Date.UTC(y, m, 0, 12, 0, 0));
  const end = endDate.toISOString().slice(0, 10);
  return { start, end };
}

/** Matches dashboard SVG `viewBox` circles with r=34 (stroke drawn on centerline). */
const LEAVE_DASHBOARD_RING_C = 2 * Math.PI * 34;

/** 0–100 → reliable stroke-dashoffset for a -90° rotated progress ring. */
function leaveDashboardRingOffset(pct0to100: number): number {
  const p = Math.min(100, Math.max(0, pct0to100)) / 100;
  return LEAVE_DASHBOARD_RING_C * (1 - p);
}

function shiftMonthKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1, 12, 0, 0));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function displayName(p: LeaveRequest | ToilCreditRequest | CarryoverRequest | EncashmentRequest): string {
  const raw = p.profiles;
  const row = Array.isArray(raw) ? raw[0] : raw;
  return row?.full_name?.trim() || 'Team member';
}

function isWithinApprovedChangeWindow(r: LeaveRequest, windowHours: number): boolean {
  if (r.status !== 'approved' || !r.decided_at) return false;
  const decidedMs = new Date(r.decided_at).getTime();
  if (!Number.isFinite(decidedMs)) return false;
  return Date.now() <= decidedMs + windowHours * 60 * 60 * 1000;
}

const STATUS_MAP: Record<string, { label: string; dot: string; text: string; bg: string }> = {
  pending:   { label: 'Awaiting approval', dot: 'bg-amber-400',   text: 'text-amber-800',  bg: 'bg-amber-50 border-amber-200' },
  approved:  { label: 'Approved',          dot: 'bg-emerald-500', text: 'text-emerald-800', bg: 'bg-emerald-50 border-emerald-200' },
  pending_cancel: { label: 'Cancel request pending', dot: 'bg-amber-400', text: 'text-amber-800', bg: 'bg-amber-50 border-amber-200' },
  pending_edit: { label: 'Edit request pending', dot: 'bg-amber-400', text: 'text-amber-800', bg: 'bg-amber-50 border-amber-200' },
  rejected:  { label: 'Declined',          dot: 'bg-red-400',     text: 'text-red-800',     bg: 'bg-red-50 border-red-200' },
  cancelled: { label: 'Cancelled',         dot: 'bg-[#d0d0d0]',   text: 'text-[#6b6b6b]',  bg: 'bg-[#f5f4f1] border-[#e0e0e0]' },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, dot: 'bg-[#d0d0d0]', text: 'text-[#6b6b6b]', bg: 'bg-[#f5f4f1] border-[#e0e0e0]' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${s.bg} ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function LeaveHubClient({
  orgId,
  userId,
  canSubmit,
  canApprove,
  canManage,
  initialYear,
  orgTimezone,
  leaveYearStartMonth,
  leaveYearStartDay,
  approvedChangeWindowHours,
  leaveUseWorkingDays,
  nonWorkingIsoDows,
  toilMinutesPerDay,
  initialHolidayPeriods,
}: {
  orgId: string;
  userId: string;
  canSubmit: boolean;
  canApprove: boolean;
  canManage: boolean;
  initialYear: string;
  /** Org IANA zone for leave-year “today”; null falls back to UTC (matches server when unset). */
  orgTimezone: string | null;
  leaveYearStartMonth: number;
  leaveYearStartDay: number;
  approvedChangeWindowHours: number;
  /** When true, annual/TOIL deducts only working days (excludes nonWorkingIsoDows). */
  leaveUseWorkingDays: boolean;
  /** ISO weekdays 1–7 (Mon–Sun) that do not count toward leave. */
  nonWorkingIsoDows: number[];
  /** Minutes counted as one day when converting earned overtime into TOIL balance (e.g. 480 = 8h). */
  toilMinutesPerDay: number;
  initialHolidayPeriods: HolidayPeriod[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [year, setYear] = useState(initialYear);

  useLayoutEffect(() => {
    setYear(
      orgTimezone
        ? currentLeaveYearKeyForOrgCalendar(new Date(), orgTimezone, leaveYearStartMonth, leaveYearStartDay)
        : currentLeaveYearKeyUtc(new Date(), leaveYearStartMonth, leaveYearStartDay),
    );
  }, [orgTimezone, leaveYearStartMonth, leaveYearStartDay]);
  const [allowance, setAllowance] = useState<AllowanceRow | null>(null);
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [myToilCreditRequests, setMyToilCreditRequests] = useState<ToilCreditRequest[]>([]);
  const [myCarryoverRequests, setMyCarryoverRequests] = useState<CarryoverRequest[]>([]);
  const [myEncashmentRequests, setMyEncashmentRequests] = useState<EncashmentRequest[]>([]);
  const [pendingForMe, setPendingForMe] = useState<LeaveRequest[]>([]);
  const [pendingToilForMe, setPendingToilForMe] = useState<ToilCreditRequest[]>([]);
  const [pendingCarryoverForMe, setPendingCarryoverForMe] = useState<CarryoverRequest[]>([]);
  const [pendingEncashmentForMe, setPendingEncashmentForMe] = useState<EncashmentRequest[]>([]);
  const [sickness, setSickness] = useState<SicknessRow[]>([]);
  const [sspSummary, setSspSummary] = useState<Record<string, unknown> | null>(null);
  const [holidayPeriods, setHolidayPeriods] = useState<HolidayPeriod[]>(initialHolidayPeriods ?? []);
  const [teamAbsences, setTeamAbsences] = useState<TeamAbsence[]>([]);
  const [documentsByRequestId, setDocumentsByRequestId] = useState<Record<string, LeaveRequestDocument[]>>({});
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
  const [absenceScore, setAbsenceScore] = useState<{ spell_count: number; total_days: number; bradford_score: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [showToilEarnForm, setShowToilEarnForm] = useState(false);
  const [showCarryoverForm, setShowCarryoverForm] = useState(false);
  const [showEncashmentForm, setShowEncashmentForm] = useState(false);
  const [showSickForm, setShowSickForm] = useState(false);
  const [showSickHistory, setShowSickHistory] = useState(false);

  const [formKind, setFormKind] = useState<RequestableLeaveKind>('annual');
  const [formStart, setFormStart] = useState('');
  const [formEnd, setFormEnd] = useState('');
  const [formNote, setFormNote] = useState('');
  const [formDayMode, setFormDayMode] = useState<'full' | 'half'>('full');
  const [formHalfDayPortion, setFormHalfDayPortion] = useState<'am' | 'pm'>('am');
  const [formParentalSubtype, setFormParentalSubtype] = useState<ParentalSubtype>('maternity');
  const [formSupportingDoc, setFormSupportingDoc] = useState<File | null>(null);
  const [formSupportingDocKind, setFormSupportingDocKind] = useState<LeaveRequestDocument['document_kind']>('fit_note');

  const [sickStart, setSickStart] = useState('');
  const [sickEnd, setSickEnd] = useState('');
  const [sickNotes, setSickNotes] = useState('');
  const [sickDayMode, setSickDayMode] = useState<'full' | 'half'>('full');
  const [sickHalfDayPortion, setSickHalfDayPortion] = useState<'am' | 'pm'>('am');
  const [editTarget, setEditTarget] = useState<LeaveRequest | null>(null);
  const [editKind, setEditKind] = useState<RequestableLeaveKind>('annual');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editDayMode, setEditDayMode] = useState<'full' | 'half'>('full');
  const [editHalfDayPortion, setEditHalfDayPortion] = useState<'am' | 'pm'>('am');
  const [editParentalSubtype, setEditParentalSubtype] = useState<ParentalSubtype>('maternity');
  const [approvalModal, setApprovalModal] = useState<
    null | { source: 'leave' | 'toil_credit' | 'carryover' | 'encashment'; id: string; approve: boolean }
  >(null);
  const [approvalNote, setApprovalNote] = useState('');
  const [selectedApprovalKeys, setSelectedApprovalKeys] = useState<string[]>([]);
  const [bulkApprovalNote, setBulkApprovalNote] = useState('');
  const [toilEarnWorkDate, setToilEarnWorkDate] = useState('');
  const [toilEarnAmount, setToilEarnAmount] = useState('');
  const [toilEarnUnit, setToilEarnUnit] = useState<'minutes' | 'hours' | 'days'>('hours');
  const [toilEarnNote, setToilEarnNote] = useState('');
  const [carryoverFromYear, setCarryoverFromYear] = useState('');
  const [carryoverDays, setCarryoverDays] = useState('');
  const [carryoverNote, setCarryoverNote] = useState('');
  const [encashmentYear, setEncashmentYear] = useState('');
  const [encashmentDays, setEncashmentDays] = useState('');
  const [encashmentNote, setEncashmentNote] = useState('');
  const [leaveExempt, setLeaveExempt] = useState(false);
  const [encashmentAvailable, setEncashmentAvailable] = useState<number | null>(null);
  /** False until a full `load()` finishes so balances + ring dashboard appear in one paint. */
  const [leaveHubReady, setLeaveHubReady] = useState(false);
  const [leaveMoreMenuOpen, setLeaveMoreMenuOpen] = useState(false);
  const leaveMoreMenuRef = useRef<HTMLDivElement>(null);
  /** Team calendar: filter by department (managers / admins). */
  const [teamCalendarDeptFilter, setTeamCalendarDeptFilter] = useState<'all' | string>('all');
  const [teamCalendarDeptOptions, setTeamCalendarDeptOptions] = useState<{ id: string; name: string }[]>([]);
  /** When false, long explanatory copy + SSP (etc.) stay hidden for a cleaner page. */
  const [leaveExplainerOpen, setLeaveExplainerOpen] = useState(false);

  const selectedLeavePeriodLabel = useMemo(
    () => formatLeaveYearPeriodRange(year, leaveYearStartMonth, leaveYearStartDay),
    [year, leaveYearStartMonth, leaveYearStartDay],
  );

  const yearOptions = useMemo(() => {
    const now = new Date();
    const cy = orgTimezone ? calendarYmdInTimeZone(now, orgTimezone).y : now.getUTCFullYear();
    const base = [cy - 1, cy, cy + 1];
    const yNum = Number(year);
    if (Number.isFinite(yNum) && !base.includes(yNum)) {
      base.push(yNum);
      base.sort((a, b) => a - b);
    }
    return base.map(String);
  }, [year, orgTimezone]);

  const requestableKinds = useMemo(
    () =>
      leaveExempt
        ? REQUESTABLE_LEAVE_KINDS.filter((k) => k !== 'annual' && k !== 'toil')
        : [...REQUESTABLE_LEAVE_KINDS],
    [leaveExempt],
  );

  const bookLeaveKindRows = useMemo(() => {
    const ordered = BOOK_LEAVE_KIND_ORDER.filter((k) => requestableKinds.includes(k));
    return { row1: ordered.slice(0, 4), row2: ordered.slice(4) };
  }, [requestableKinds]);

  useEffect(() => {
    if (!leaveExempt) return;
    if (formKind === 'annual' || formKind === 'toil') {
      setFormKind((requestableKinds[0] ?? 'unpaid') as RequestableLeaveKind);
    }
  }, [leaveExempt, formKind, requestableKinds]);

  const load = useCallback(async () => {
    setMsg(null);
    const toIso = new Date().toISOString().slice(0, 10);
    const fromIso = new Date(Date.now() - 730 * 86400000).toISOString().slice(0, 10);

    try {
      const [
        { data: al },
        { data: mine },
        { data: sick },
        { data: bf },
        { data: mineToil },
        { data: ssp },
        { data: myCarry },
        { data: myEncash },
        { data: holidays },
        { data: ehr },
        encRes,
      ] = await Promise.all([
        supabase.from('leave_allowances').select('leave_year, annual_entitlement_days, toil_balance_days').eq('org_id', orgId).eq('user_id', userId).eq('leave_year', year).maybeSingle(),
        supabase.from('leave_requests').select('id, kind, start_date, end_date, half_day_portion, parental_subtype, status, note, decision_note, created_at, decided_at, requested_action_at, proposed_kind, proposed_start_date, proposed_end_date, proposed_note, proposed_half_day_portion, proposed_parental_subtype').eq('org_id', orgId).eq('requester_id', userId).order('created_at', { ascending: false }).limit(80),
        supabase.from('sickness_absences').select('id, start_date, end_date, half_day_portion, notes').eq('org_id', orgId).eq('user_id', userId).order('start_date', { ascending: false }).limit(80),
        supabase.rpc('bradford_factor_for_user', { p_user_id: userId, p_on: toIso }),
        supabase
          .from('toil_credit_requests')
          .select('id, work_date, minutes_earned, note, status, decision_note, created_at')
          .eq('org_id', orgId)
          .eq('requester_id', userId)
          .order('created_at', { ascending: false })
          .limit(40),
        supabase.rpc('ssp_calculation_summary', { p_user_id: userId, p_from: fromIso, p_to: toIso }),
        supabase
          .from('leave_carryover_requests')
          .select('id, from_leave_year, to_leave_year, days_requested, days_approved, note, status, decision_note, created_at')
          .eq('org_id', orgId)
          .eq('requester_id', userId)
          .order('created_at', { ascending: false })
          .limit(40),
        supabase
          .from('leave_encashment_requests')
          .select('id, leave_year, days_requested, days_approved, note, status, decision_note, created_at')
          .eq('org_id', orgId)
          .eq('requester_id', userId)
          .order('created_at', { ascending: false })
          .limit(40),
        supabase
          .from('org_leave_holiday_periods')
          .select('id, name, holiday_kind, start_date, end_date, is_active')
          .eq('org_id', orgId)
          .eq('is_active', true)
          .order('start_date', { ascending: true }),
        supabase.from('employee_hr_records').select('annual_leave_entitlement_exempt').eq('org_id', orgId).eq('user_id', userId).maybeSingle(),
        supabase.rpc('leave_encashment_available_days', {
          p_org_id: orgId,
          p_user_id: userId,
          p_leave_year: year,
        }),
      ]);

      const leaveExemptNext = Boolean((ehr as { annual_leave_entitlement_exempt?: boolean } | null)?.annual_leave_entitlement_exempt);
      const encashmentAvailableNext = encRes.error ? null : Number(encRes.data ?? 0);
      const allowanceNext = al
        ? {
            leave_year: String(al.leave_year),
            annual_entitlement_days: Number(al.annual_entitlement_days ?? 0),
            toil_balance_days: Number(al.toil_balance_days ?? 0),
          }
        : { leave_year: year, annual_entitlement_days: 0, toil_balance_days: 0 };
      const mineRows = (mine ?? []) as LeaveRequest[];

      const b0 = Array.isArray(bf) ? bf[0] : bf;
      const absenceScoreNext =
        b0 && typeof b0 === 'object' && 'spell_count' in b0
          ? {
              spell_count: Number((b0 as { spell_count: number }).spell_count),
              total_days: Number((b0 as { total_days: number }).total_days),
              bradford_score: Number((b0 as { bradford_score: number }).bradford_score),
            }
          : null;

      let pendingForMeNext: LeaveRequest[] = [];
      let pendingToilNext: ToilCreditRequest[] = [];
      let pendingCarryNext: CarryoverRequest[] = [];
      let pendingEncashNext: EncashmentRequest[] = [];
      let teamAbsencesNext: TeamAbsence[] = [];
      let documentsNext: Record<string, LeaveRequestDocument[]> = {};
      let teamCalendarDeptOptionsNext: { id: string; name: string }[] = [];

      if (canApprove || canManage) {
        const calRange = monthKeyToRange(calendarMonth);

        const [{ data: reportRows }, { data: dmRows }, unassignedRes] = await Promise.all([
          supabase.from('profiles').select('id').eq('org_id', orgId).eq('reports_to_user_id', userId),
          supabase.from('dept_managers').select('dept_id').eq('user_id', userId),
          canManage
            ? supabase.from('profiles').select('id').eq('org_id', orgId).is('reports_to_user_id', null)
            : Promise.resolve({ data: null as { id: string }[] | null }),
        ]);

        const scopeIdSet = new Set<string>();
        for (const r of reportRows ?? []) scopeIdSet.add(r.id as string);
        const deptIds = (dmRows ?? []).map((r) => r.dept_id as string).filter(Boolean);
        if (deptIds.length) {
          const { data: udRows } = await supabase.from('user_departments').select('user_id').in('dept_id', deptIds);
          for (const r of udRows ?? []) scopeIdSet.add(r.user_id as string);
        }
        if (canManage && unassignedRes.data) {
          for (const r of unassignedRes.data ?? []) scopeIdSet.add(r.id as string);
        }

        const approvalScopeIds = [...scopeIdSet];

        let pend: LeaveRequest[] = [];
        let pendToil: ToilCreditRequest[] = [];
        let pendCarry: CarryoverRequest[] = [];
        let pendEncash: EncashmentRequest[] = [];
        let absRows: Record<string, unknown>[] = [];

        if (approvalScopeIds.length) {
          const absBase = supabase
            .from('leave_requests')
            .select('id, requester_id, kind, start_date, end_date, half_day_portion')
            .eq('org_id', orgId)
            .eq('status', 'approved')
            .lte('start_date', calRange.end)
            .gte('end_date', calRange.start)
            .order('start_date', { ascending: true })
            .in('requester_id', approvalScopeIds);

          const [
            { data: lrData },
            { data: toilData },
            { data: carryData },
            { data: encashData },
            { data: absData },
          ] = await Promise.all([
            supabase
              .from('leave_requests')
              .select(
                'id, requester_id, kind, start_date, end_date, half_day_portion, parental_subtype, status, note, created_at, proposed_kind, proposed_start_date, proposed_end_date, proposed_note, proposed_half_day_portion, proposed_parental_subtype',
              )
              .eq('org_id', orgId)
              .in('status', ['pending', 'pending_cancel', 'pending_edit'])
              .in('requester_id', approvalScopeIds)
              .order('created_at', { ascending: false }),
            supabase
              .from('toil_credit_requests')
              .select('id, requester_id, work_date, minutes_earned, note, status, created_at')
              .eq('org_id', orgId)
              .eq('status', 'pending')
              .in('requester_id', approvalScopeIds)
              .order('created_at', { ascending: false }),
            supabase
              .from('leave_carryover_requests')
              .select('id, requester_id, from_leave_year, to_leave_year, days_requested, days_approved, note, status, decision_note, created_at')
              .eq('org_id', orgId)
              .eq('status', 'pending')
              .in('requester_id', approvalScopeIds)
              .order('created_at', { ascending: false }),
            supabase
              .from('leave_encashment_requests')
              .select('id, requester_id, leave_year, days_requested, days_approved, note, status, decision_note, created_at')
              .eq('org_id', orgId)
              .eq('status', 'pending')
              .in('requester_id', approvalScopeIds)
              .order('created_at', { ascending: false }),
            absBase,
          ]);
          pend = (lrData ?? []) as LeaveRequest[];
          pendToil = (toilData ?? []) as ToilCreditRequest[];
          pendCarry = (carryData ?? []) as CarryoverRequest[];
          pendEncash = (encashData ?? []) as EncashmentRequest[];
          absRows = (absData ?? []) as Record<string, unknown>[];
        }

        const nameIds = [
          ...new Set([
            ...pend.map((r) => r.requester_id as string),
            ...pendToil.map((t) => t.requester_id as string),
            ...pendCarry.map((c) => c.requester_id as string),
            ...pendEncash.map((e) => e.requester_id as string),
          ]),
        ];
        const absRequesterIds = [...new Set(absRows.map((r) => String(r.requester_id ?? '')).filter(Boolean))];
        const allLookupIds = [...new Set([...nameIds, ...absRequesterIds])];
        const idToName: Record<string, string> = {};
        if (allLookupIds.length) {
          const { data: profs } = await supabase.from('coworker_directory_public').select('id, full_name').in('id', allLookupIds);
          for (const p of profs ?? []) idToName[p.id as string] = (p.full_name as string) ?? '';
        }

        const userDeptMap: Record<string, string[]> = {};
        if (absRequesterIds.length) {
          const { data: udAbs } = await supabase.from('user_departments').select('user_id, dept_id').in('user_id', absRequesterIds);
          for (const row of udAbs ?? []) {
            const uid = String(row.user_id);
            if (!userDeptMap[uid]) userDeptMap[uid] = [];
            userDeptMap[uid].push(String(row.dept_id));
          }
        }

        pendingForMeNext = pend.map((r) => ({ ...r, profiles: { full_name: idToName[r.requester_id as string] ?? '' } }));
        pendingToilNext = pendToil.map((t) => ({ ...t, profiles: { full_name: idToName[t.requester_id as string] ?? '' } }));
        pendingCarryNext = pendCarry.map((c) => ({ ...c, profiles: { full_name: idToName[c.requester_id as string] ?? '' } }));
        pendingEncashNext = pendEncash.map((e) => ({ ...e, profiles: { full_name: idToName[e.requester_id as string] ?? '' } }));

        teamAbsencesNext = absRows.map((r) => ({
          id: String(r.id),
          requester_id: String(r.requester_id),
          requester_name: idToName[String(r.requester_id)] || 'Team member',
          kind: String(r.kind),
          start_date: String(r.start_date),
          end_date: String(r.end_date),
          half_day_portion: (r.half_day_portion as 'am' | 'pm' | null | undefined) ?? null,
          dept_ids: userDeptMap[String(r.requester_id)] ?? [],
        }));

        const deptIdSetForFilter = new Set<string>(deptIds);
        for (const ids of Object.values(userDeptMap)) {
          for (const id of ids) deptIdSetForFilter.add(id);
        }
        if (deptIdSetForFilter.size > 0) {
          const { data: deptRows } = await supabase
            .from('departments')
            .select('id, name')
            .eq('org_id', orgId)
            .in('id', [...deptIdSetForFilter])
            .order('name');
          teamCalendarDeptOptionsNext = (deptRows ?? []).map((d) => ({
            id: String(d.id),
            name: String(d.name ?? 'Department'),
          }));
        }

        const docRequestIds = [...new Set([...mineRows.map((r) => r.id), ...pend.map((r) => r.id)])].filter(Boolean);
        if (docRequestIds.length) {
          const { data: docs } = await supabase
            .from('leave_request_documents')
            .select('id, request_id, document_kind, file_name, storage_path')
            .eq('org_id', orgId)
            .in('request_id', docRequestIds)
            .order('created_at', { ascending: false });
          const next: Record<string, LeaveRequestDocument[]> = {};
          for (const d of (docs ?? []) as LeaveRequestDocument[]) {
            if (!next[d.request_id]) next[d.request_id] = [];
            next[d.request_id].push(d);
          }
          documentsNext = next;
        }
      } else {
        const ownIds = mineRows.map((r) => r.id).filter(Boolean);
        if (ownIds.length) {
          const { data: docs } = await supabase
            .from('leave_request_documents')
            .select('id, request_id, document_kind, file_name, storage_path')
            .eq('org_id', orgId)
            .in('request_id', ownIds)
            .order('created_at', { ascending: false });
          const next: Record<string, LeaveRequestDocument[]> = {};
          for (const d of (docs ?? []) as LeaveRequestDocument[]) {
            if (!next[d.request_id]) next[d.request_id] = [];
            next[d.request_id].push(d);
          }
          documentsNext = next;
        }
      }

      setLeaveExempt(leaveExemptNext);
      setEncashmentAvailable(encashmentAvailableNext);
      setAllowance(allowanceNext);
      setMyRequests(mineRows);
      setMyToilCreditRequests((mineToil ?? []) as ToilCreditRequest[]);
      setMyCarryoverRequests((myCarry ?? []) as CarryoverRequest[]);
      setMyEncashmentRequests((myEncash ?? []) as EncashmentRequest[]);
      setSickness((sick ?? []) as SicknessRow[]);
      setHolidayPeriods((holidays ?? []) as HolidayPeriod[]);
      setSspSummary(ssp && typeof ssp === 'object' ? (ssp as Record<string, unknown>) : null);
      setAbsenceScore(absenceScoreNext);
      setPendingForMe(pendingForMeNext);
      setPendingToilForMe(pendingToilNext);
      setPendingCarryoverForMe(pendingCarryNext);
      setPendingEncashmentForMe(pendingEncashNext);
      setTeamAbsences(teamAbsencesNext);
      setTeamCalendarDeptOptions(teamCalendarDeptOptionsNext);
      setTeamCalendarDeptFilter((prev) => {
        if (prev === 'all') return 'all';
        return teamCalendarDeptOptionsNext.some((o) => o.id === prev) ? prev : 'all';
      });
      setDocumentsByRequestId(documentsNext);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed to load leave data.');
    } finally {
      setLeaveHubReady(true);
    }
  }, [supabase, orgId, userId, year, canApprove, canManage, calendarMonth]);

  const invalidateLeaveAttendanceCaches = useCallback(async () => {
    await invalidateClientCaches({ scopes: ['leave-attendance'] });
  }, []);

  const handleLeaveMutationSuccess = useCallback(async () => {
    await invalidateLeaveAttendanceCaches().catch(() => null);
    await load();
  }, [invalidateLeaveAttendanceCaches, load]);

  useEffect(() => {
    setLeaveHubReady(false);
  }, [year]);

  useEffect(() => { void load(); }, [load]);
  useShellRefresh(() => void load());

  useEffect(() => {
    if (!leaveMoreMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (leaveMoreMenuRef.current && !leaveMoreMenuRef.current.contains(e.target as Node)) {
        setLeaveMoreMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLeaveMoreMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [leaveMoreMenuOpen]);

  async function submitLeave(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !formStart || !formEnd) return;
    if (leaveRangeOverlapsExisting(myRequests, formStart, formEnd)) {
      setMsg('Those dates overlap another leave booking. Change the range or cancel the other request first.');
      return;
    }
    setBusy(true); setMsg(null);
    const { data: requestId, error } = await supabase.rpc('leave_request_submit', {
      p_kind: formKind,
      p_start: formStart,
      p_end: formDayMode === 'half' ? formStart : formEnd,
      p_note: formNote.trim() || null,
      p_half_day_portion: formDayMode === 'half' ? formHalfDayPortion : null,
      p_parental_subtype: formKind === 'parental' ? formParentalSubtype : null,
    });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    if (requestId && formSupportingDoc) {
      const file = formSupportingDoc;
      const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
      const path = `${orgId}/${userId}/${requestId}/${crypto.randomUUID()}.${ext}`;
      setBusy(true);
      const { error: upErr } = await supabase.storage.from('leave-supporting-documents').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || undefined,
      });
      if (upErr) {
        setBusy(false);
        setMsg(upErr.message);
        return;
      }
      const { error: metaErr } = await supabase.from('leave_request_documents').insert({
        org_id: orgId,
        request_id: requestId,
        requester_id: userId,
        document_kind: formSupportingDocKind,
        file_name: file.name,
        storage_path: path,
        mime_type: file.type || null,
        file_size_bytes: file.size,
      });
      setBusy(false);
      if (metaErr) {
        setMsg(metaErr.message);
        return;
      }
    }
    setFormStart(''); setFormEnd(''); setFormNote(''); setFormDayMode('full'); setFormHalfDayPortion('am'); setFormParentalSubtype('maternity'); setFormSupportingDoc(null); setFormSupportingDocKind('fit_note'); setShowLeaveForm(false);
    await handleLeaveMutationSuccess();
  }

  async function openSupportingDocument(doc: LeaveRequestDocument) {
    const { data, error } = await supabase.storage.from('leave-supporting-documents').createSignedUrl(doc.storage_path, 3600);
    if (error || !data?.signedUrl) {
      setMsg(error?.message ?? 'Unable to open document.');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function submitSickness(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !sickStart || !sickEnd) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc('sickness_absence_create', {
      p_user_id: userId,
      p_start: sickStart,
      p_end: sickDayMode === 'half' ? sickStart : sickEnd,
      p_notes: sickNotes.trim() || null,
      p_half_day_portion: sickDayMode === 'half' ? sickHalfDayPortion : null,
    });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setSickStart(''); setSickEnd(''); setSickNotes(''); setSickDayMode('full'); setSickHalfDayPortion('am'); setShowSickForm(false);
    await handleLeaveMutationSuccess();
  }

  async function cancelRequest(id: string) {
    setBusy(true);
    queueEntityCalendarSync({ type: 'leave', id, action: 'delete' });
    const { error } = await supabase.rpc('leave_request_cancel', { p_request_id: id });
    setBusy(false);
    if (error) setMsg(error.message);
    else await handleLeaveMutationSuccess();
  }

  async function cancelToilCreditRequest(id: string) {
    setBusy(true);
    const { error } = await supabase.rpc('toil_credit_request_cancel', { p_request_id: id });
    setBusy(false);
    if (error) setMsg(error.message);
    else await handleLeaveMutationSuccess();
  }

  async function cancelCarryoverRequest(id: string) {
    setBusy(true);
    const { error } = await supabase.rpc('leave_carryover_request_cancel', { p_request_id: id });
    setBusy(false);
    if (error) setMsg(error.message);
    else await handleLeaveMutationSuccess();
  }

  async function cancelEncashmentRequest(id: string) {
    setBusy(true);
    const { error } = await supabase.rpc('leave_encashment_request_cancel', { p_request_id: id });
    setBusy(false);
    if (error) setMsg(error.message);
    else await handleLeaveMutationSuccess();
  }

  async function requestCancelApproval(id: string) {
    setBusy(true);
    const { error } = await supabase.rpc('leave_request_cancel_request', { p_request_id: id });
    setBusy(false);
    if (error) setMsg(error.message);
    else await handleLeaveMutationSuccess();
  }

  async function requestEditApproval(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget || !editStart || !editEnd) return;
    if (leaveRangeOverlapsExisting(myRequests, editStart, editEnd, editTarget.id)) {
      setMsg('Those dates overlap another leave booking. Change the range or cancel the other request first.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('leave_request_edit_request', {
      p_request_id: editTarget.id,
      p_kind: editKind,
      p_start: editStart,
      p_end: editDayMode === 'half' ? editStart : editEnd,
      p_note: editNote.trim() || null,
      p_half_day_portion: editDayMode === 'half' ? editHalfDayPortion : null,
      p_parental_subtype: editKind === 'parental' ? editParentalSubtype : null,
    });
    setBusy(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setEditTarget(null);
    setEditStart('');
    setEditEnd('');
    setEditNote('');
    setEditDayMode('full');
    setEditHalfDayPortion('am');
    setEditParentalSubtype('maternity');
    await handleLeaveMutationSuccess();
  }

  function openEditDialog(r: LeaveRequest) {
    setEditTarget(r);
    const nextKind = REQUESTABLE_LEAVE_KINDS.includes(r.kind as RequestableLeaveKind)
      ? (r.kind as RequestableLeaveKind)
      : 'annual';
    setEditKind(nextKind);
    setEditStart(r.start_date);
    setEditEnd(r.end_date);
    setEditNote(r.note ?? '');
    setEditDayMode(r.half_day_portion ? 'half' : 'full');
    setEditHalfDayPortion((r.half_day_portion === 'pm' ? 'pm' : 'am') as 'am' | 'pm');
    setEditParentalSubtype((r.parental_subtype ?? 'maternity') as ParentalSubtype);
    setMsg(null);
  }

  function openApprovalDialog(source: 'leave' | 'toil_credit' | 'carryover' | 'encashment', id: string, approve: boolean) {
    setApprovalModal({ source, id, approve });
    setApprovalNote('');
    setMsg(null);
  }

  async function submitToilEarn(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !toilEarnWorkDate) return;
    const amt = Number(toilEarnAmount);
    const minutes = toilInputToMinutes(amt, toilEarnUnit, toilMinutesPerDay);
    if (minutes < 1) {
      setMsg('Enter a positive amount of overtime.');
      return;
    }
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc('toil_credit_request_submit', {
      p_work_date: toilEarnWorkDate,
      p_minutes: minutes,
      p_note: toilEarnNote.trim() || null,
    });
    setBusy(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setToilEarnWorkDate('');
    setToilEarnAmount('');
    setToilEarnNote('');
    setShowToilEarnForm(false);
    await handleLeaveMutationSuccess();
  }

  async function submitCarryoverRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc('leave_carryover_request_submit', {
      p_from_leave_year: carryoverFromYear || year,
      p_days_requested: Number(carryoverDays),
      p_note: carryoverNote.trim() || null,
    });
    setBusy(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setCarryoverFromYear('');
    setCarryoverDays('');
    setCarryoverNote('');
    setShowCarryoverForm(false);
    await handleLeaveMutationSuccess();
  }

  async function submitEncashmentRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc('leave_encashment_request_submit', {
      p_leave_year: encashmentYear || year,
      p_days_requested: Number(encashmentDays),
      p_note: encashmentNote.trim() || null,
    });
    setBusy(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setEncashmentYear('');
    setEncashmentDays('');
    setEncashmentNote('');
    setShowEncashmentForm(false);
    await handleLeaveMutationSuccess();
  }

  async function submitApprovalDecision() {
    if (!approvalModal) return;
    setBusy(true);
    const note = approvalNote.trim() || null;
    const { error } =
      approvalModal.source === 'leave'
        ? await supabase.rpc('leave_request_decide', {
            p_request_id: approvalModal.id,
            p_approve: approvalModal.approve,
            p_note: note,
          })
        : approvalModal.source === 'toil_credit'
        ? await supabase.rpc('toil_credit_request_decide', {
            p_request_id: approvalModal.id,
            p_approve: approvalModal.approve,
            p_note: note,
          })
        : approvalModal.source === 'carryover'
        ? await supabase.rpc('leave_carryover_request_decide', {
            p_request_id: approvalModal.id,
            p_approve: approvalModal.approve,
            p_note: note,
          })
        : await supabase.rpc('leave_encashment_request_decide', {
            p_request_id: approvalModal.id,
            p_approve: approvalModal.approve,
            p_note: note,
          });
    setBusy(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    if (approvalModal.source === 'leave') {
      const action = approvalModal.approve ? 'upsert' : 'delete';
      queueEntityCalendarSync({ type: 'leave', id: approvalModal.id, action });
    }
    setApprovalModal(null);
    setApprovalNote('');
    await handleLeaveMutationSuccess();
  }

  async function submitBulkApprovalDecision(approve: boolean) {
    if (!selectedApprovalKeys.length) return;
    setBusy(true);
    const note = bulkApprovalNote.trim() || null;
    const selected = mergedApprovalQueue.filter((row) => selectedApprovalKeys.includes(row.key));
    let success = 0;
    const failures: string[] = [];
    for (const row of selected) {
      const { error } =
        row.kind === 'leave'
          ? await supabase.rpc('leave_request_decide', {
              p_request_id: row.leave.id,
              p_approve: approve,
              p_note: note,
            })
          : row.kind === 'toil'
          ? await supabase.rpc('toil_credit_request_decide', {
              p_request_id: row.toil.id,
              p_approve: approve,
              p_note: note,
            })
          : row.kind === 'carryover'
          ? await supabase.rpc('leave_carryover_request_decide', {
              p_request_id: row.carryover.id,
              p_approve: approve,
              p_note: note,
            })
          : await supabase.rpc('leave_encashment_request_decide', {
              p_request_id: row.encashment.id,
              p_approve: approve,
              p_note: note,
            });
      if (error) failures.push(error.message);
      else {
        success += 1;
        if (row.kind === 'leave') {
          queueEntityCalendarSync({
            type: 'leave',
            id: row.leave.id,
            action: approve ? 'upsert' : 'delete',
          });
        }
      }
    }
    setBusy(false);
    setSelectedApprovalKeys([]);
    setBulkApprovalNote('');
    await handleLeaveMutationSuccess();
    if (failures.length) {
      setMsg(`${success} processed, ${failures.length} failed. ${failures[0]}`);
    } else {
      setMsg(`${success} request${success === 1 ? '' : 's'} ${approve ? 'approved' : 'rejected'}.`);
    }
  }

  const mergedApprovalQueue = useMemo(() => {
    type Row =
      | { key: string; created_at: string; kind: 'leave'; leave: LeaveRequest }
      | { key: string; created_at: string; kind: 'toil'; toil: ToilCreditRequest }
      | { key: string; created_at: string; kind: 'carryover'; carryover: CarryoverRequest }
      | { key: string; created_at: string; kind: 'encashment'; encashment: EncashmentRequest };
    const rows: Row[] = [
      ...pendingForMe.map((leave) => ({
        key: `leave-${leave.id}`,
        created_at: leave.created_at,
        kind: 'leave' as const,
        leave,
      })),
      ...pendingToilForMe.map((toil) => ({
        key: `toil-${toil.id}`,
        created_at: toil.created_at,
        kind: 'toil' as const,
        toil,
      })),
      ...pendingCarryoverForMe.map((carryover) => ({
        key: `carry-${carryover.id}`,
        created_at: carryover.created_at,
        kind: 'carryover' as const,
        carryover,
      })),
      ...pendingEncashmentForMe.map((encashment) => ({
        key: `encash-${encashment.id}`,
        created_at: encashment.created_at,
        kind: 'encashment' as const,
        encashment,
      })),
    ];
    rows.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
    return rows;
  }, [pendingForMe, pendingToilForMe, pendingCarryoverForMe, pendingEncashmentForMe]);

  useEffect(() => {
    const valid = new Set(mergedApprovalQueue.map((r) => r.key));
    setSelectedApprovalKeys((prev) => prev.filter((k) => valid.has(k)));
  }, [mergedApprovalQueue]);

  const leaveYearStartIso = useMemo(() => {
    const y = Number(year);
    return `${String(y).padStart(4, '0')}-${String(leaveYearStartMonth).padStart(2, '0')}-${String(leaveYearStartDay).padStart(2, '0')}`;
  }, [year, leaveYearStartMonth, leaveYearStartDay]);
  const leaveYearEndIso = useMemo(() => {
    const y = Number(year) + 1;
    const d = new Date(Date.UTC(y, leaveYearStartMonth - 1, leaveYearStartDay));
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }, [year, leaveYearStartMonth, leaveYearStartDay]);

  const leaveDayOpts: OrgLeaveDayOptions = useMemo(
    () => ({
      leaveUseWorkingDays,
      nonWorkingIsoDows: nonWorkingIsoDows.length ? nonWorkingIsoDows : [6, 7],
      excludedDates: (() => {
        const s = new Set<string>();
        for (const h of holidayPeriods) {
          let d = h.start_date;
          while (d <= h.end_date) {
            s.add(d);
            const t = new Date(`${d}T12:00:00Z`);
            t.setUTCDate(t.getUTCDate() + 1);
            d = t.toISOString().slice(0, 10);
          }
        }
        return s;
      })(),
    }),
    [leaveUseWorkingDays, nonWorkingIsoDows, holidayPeriods],
  );

  const usedAnnual = useMemo(
    () =>
      myRequests
        .filter((r) => r.kind === 'annual' && annualCountsTowardUsage(r.status))
        .reduce((acc, r) => {
          const seg = overlapInclusiveRange(r.start_date, r.end_date, leaveYearStartIso, leaveYearEndIso);
          if (!seg) return acc;
          return acc + countOrgLeaveDaysInclusive(seg.start, seg.end, leaveDayOpts);
        }, 0),
    [myRequests, leaveYearStartIso, leaveYearEndIso, leaveDayOpts],
  );
  const usedToil = useMemo(
    () =>
      myRequests
        .filter((r) => r.kind === 'toil' && annualCountsTowardUsage(r.status))
        .reduce((acc, r) => {
          const seg = overlapInclusiveRange(r.start_date, r.end_date, leaveYearStartIso, leaveYearEndIso);
          if (!seg) return acc;
          return acc + countOrgLeaveDaysInclusive(seg.start, seg.end, leaveDayOpts);
        }, 0),
    [myRequests, leaveYearStartIso, leaveYearEndIso, leaveDayOpts],
  );

  const entitlement = allowance?.annual_entitlement_days ?? 0;
  const remaining = Math.max(0, entitlement - usedAnnual);
  const toilBalance = allowance?.toil_balance_days ?? 0;
  const usedPct = entitlement > 0 ? Math.min(100, Math.round((usedAnnual / entitlement) * 100)) : 0;
  const toilPoolDays = toilBalance + usedToil;
  /** Ring matches the headline (days left): share of annual allowance still available. */
  const annualRemainingPct = entitlement > 0 ? Math.min(100, Math.max(0, Math.round((remaining / entitlement) * 100))) : 0;
  /** Ring matches TOIL balance headline: share of earned+booked pool still unused. */
  const toilRemainingPct =
    toilPoolDays > 0 ? Math.min(100, Math.max(0, Math.round((toilBalance / toilPoolDays) * 100))) : toilBalance > 0 ? 100 : 0;
  const pendingRequestsCount = useMemo(
    () =>
      myRequests.filter(
        (r) =>
          ['pending', 'pending_edit', 'pending_cancel'].includes(r.status) &&
          leaveRequestOverlapsLeaveYear(r, leaveYearStartIso, leaveYearEndIso),
      ).length,
    [myRequests, leaveYearStartIso, leaveYearEndIso],
  );
  const approvedUpcomingCount = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return myRequests.filter(
      (r) =>
        r.status === 'approved' &&
        r.end_date >= today &&
        leaveRequestOverlapsLeaveYear(r, leaveYearStartIso, leaveYearEndIso),
    ).length;
  }, [myRequests, leaveYearStartIso, leaveYearEndIso]);

  /** Calendar trip length (inclusive). */
  const formTripDays =
    formStart && formEnd && formEnd >= formStart ? daysBetween(formStart, formEnd) : 0;
  /**
   * Leave units in the selected leave year (working days and/or calendar — matches server & hero).
   */
  const requestedDaysInLeaveYear = useMemo(() => {
    if (!formStart || !formEnd || formEnd < formStart) return 0;
    const seg = overlapInclusiveRange(formStart, formEnd, leaveYearStartIso, leaveYearEndIso);
    if (!seg) return 0;
    return countOrgLeaveDaysInclusive(seg.start, seg.end, leaveDayOpts);
  }, [formStart, formEnd, leaveYearStartIso, leaveYearEndIso, leaveDayOpts]);

  /** Calendar days in the selected leave year for the current date range (for labels when not using working-day mode). */
  const calendarDaysInLeaveYearForForm = useMemo(() => {
    if (!formStart || !formEnd || formEnd < formStart) return 0;
    const seg = overlapInclusiveRange(formStart, formEnd, leaveYearStartIso, leaveYearEndIso);
    if (!seg) return 0;
    return daysBetween(seg.start, seg.end);
  }, [formStart, formEnd, leaveYearStartIso, leaveYearEndIso]);

  const projectedAnnualRemaining =
    formKind === 'annual' ? remaining - requestedDaysInLeaveYear : remaining;
  const exceedsAnnualAllowance =
    formKind === 'annual' && requestedDaysInLeaveYear > 0 && projectedAnnualRemaining < 0;

  const newLeaveOverlaps = useMemo(
    () =>
      Boolean(
        formStart &&
          formEnd &&
          formEnd >= formStart &&
          leaveRangeOverlapsExisting(myRequests, formStart, formEnd),
      ),
    [myRequests, formStart, formEnd],
  );

  const editLeaveOverlaps = useMemo(
    () =>
      Boolean(
        editTarget &&
          editStart &&
          editEnd &&
          editEnd >= editStart &&
          leaveRangeOverlapsExisting(myRequests, editStart, editEnd, editTarget.id),
      ),
    [myRequests, editTarget, editStart, editEnd],
  );

  const teamAbsencesFiltered = useMemo(() => {
    if (teamCalendarDeptFilter === 'all') return teamAbsences;
    return teamAbsences.filter((a) => (a.dept_ids ?? []).includes(teamCalendarDeptFilter));
  }, [teamAbsences, teamCalendarDeptFilter]);

  const monthGrid = useMemo(() => {
    const { start, end } = monthKeyToRange(calendarMonth);
    const [sy, sm] = start.split('-').map(Number);
    const [ey, em, ed] = end.split('-').map(Number);
    const firstIsoDow = new Date(Date.UTC(sy, sm - 1, 1, 12, 0, 0)).getUTCDay() || 7;
    const leadingBlanks = firstIsoDow - 1;
    const days = Array.from({ length: ed }, (_, i) => {
      const day = i + 1;
      const iso = `${String(ey).padStart(4, '0')}-${String(em).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const rows = teamAbsencesFiltered.filter((a) => a.start_date <= iso && a.end_date >= iso);
      return { iso, day, rows };
    });
    return { start, end, leadingBlanks, days, monthLabel: new Date(`${start}T12:00:00Z`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) };
  }, [calendarMonth, teamAbsencesFiltered]);

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-7">
      {/* Page header */}
      <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="font-authSerif text-[28px] leading-tight tracking-[-0.03em] text-[#121212]">Time off</h1>
            <button
              type="button"
              onClick={() => setLeaveExplainerOpen((v) => !v)}
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors ${
                leaveExplainerOpen
                  ? 'border-[var(--org-brand-primary,#121212)] bg-[var(--org-brand-primary,#121212)] text-white'
                  : 'border-[#d8d8d8] bg-white text-[#6b6b6b] hover:bg-[#faf9f6]'
              }`}
              aria-expanded={leaveExplainerOpen}
              title={leaveExplainerOpen ? 'Hide extra explanations' : 'Show explanations and SSP details'}
            >
              <Info className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">{leaveExplainerOpen ? 'Hide details' : 'Details'}</span>
            </button>
          </div>
          {leaveExplainerOpen ? (
            <p className="mt-1 text-[13.5px] text-[#6b6b6b]">Book leave, log sick days, and see your balances.</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <label className="flex flex-wrap items-center justify-end gap-2 text-[12px] text-[#6b6b6b]">
              Leave year
              <select value={year} onChange={(e) => setYear(e.target.value)} className="rounded-lg border border-[#d8d8d8] bg-white px-2 py-1.5 text-[12px] text-[#121212] focus:border-[#121212] focus:outline-none">
                {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            {canManage ? (
              <Link href="/hr/leave" className="inline-flex h-8 items-center rounded-lg border border-[#d8d8d8] bg-white px-3 text-[12px] font-medium text-[#6b6b6b] hover:bg-[#f5f4f1]">
                Admin settings
              </Link>
            ) : null}
          </div>
          <p className="max-w-[min(100%,320px)] text-right text-[11px] leading-snug text-[#9b9b9b]">{selectedLeavePeriodLabel}</p>
        </div>
      </div>

      {msg ? <p className="mb-5 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[13px] text-[#b91c1c]">{msg}</p> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="min-w-0 space-y-6 lg:col-span-8">
      {!leaveHubReady ? (
        <div className="overflow-hidden rounded-2xl border border-[#e8e8e8] bg-white">
          <CampfireLoaderInline label="Loading balances" className="min-h-[280px] py-12" />
        </div>
      ) : (
        <>
      <section>
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Balances</h2>
        <div className="rounded-2xl border border-[#e8e8e8] bg-white">
          {/* overflow-hidden only on the grid so “More actions” dropdown isn’t clipped */}
          <div className={`overflow-hidden ${canSubmit ? 'rounded-t-2xl' : 'rounded-2xl'}`}>
          <div className="grid divide-y divide-[#f0f0f0] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="flex flex-col gap-1 p-4 sm:p-5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Remaining</p>
              <p className="mt-1 text-[42px] font-bold leading-none tracking-tighter text-[#121212]">
                {remaining}
                <span className="ml-1.5 text-[16px] font-normal text-[#9b9b9b]">days</span>
              </p>
              {leaveExplainerOpen && leaveUseWorkingDays ? (
                <p className="mt-1 text-[11px] text-[#9b9b9b]">Annual leave is counted in working days (weekends and other non-working weekdays excluded).</p>
              ) : null}
              {entitlement > 0 ? (
                <>
                  <div className="mt-3 h-1.5 w-full rounded-full bg-[#f0f0f0]">
                    <div className={`h-1.5 rounded-full ${usedPct >= 90 ? 'bg-amber-400' : 'bg-[var(--org-brand-primary,#121212)]'}`} style={{ width: `${usedPct}%` }} />
                  </div>
                  <p className="mt-1.5 text-[11.5px] text-[#9b9b9b]">
                    {usedAnnual} of {entitlement} {leaveUseWorkingDays ? 'working ' : ''}days used
                  </p>
                </>
              ) : null}
            </div>
            <div className="flex flex-col gap-1 p-4 sm:p-5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">TOIL balance</p>
              <p className="mt-1 text-[42px] font-bold leading-none tracking-tighter text-[#121212]">
                {toilBalance}
                <span className="ml-1.5 text-[16px] font-normal text-[#9b9b9b]">days</span>
              </p>
              {leaveExplainerOpen ? (
                <p className="mt-3 text-[11.5px] text-[#9b9b9b]">
                  Overtime earned back as paid time off. Credits use {toilMinutesPerDay} min ({toilMinutesPerDay >= 60 ? `${Math.round((toilMinutesPerDay / 60) * 10) / 10}h` : `${toilMinutesPerDay} min`}) = 1 day at your organisation.
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1 p-4 sm:p-5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Entitlement</p>
              <p className="mt-1 text-[42px] font-bold leading-none tracking-tighter text-[#121212]">
                {entitlement}
                <span className="ml-1.5 text-[16px] font-normal text-[#9b9b9b]">days / yr</span>
              </p>
            </div>
          </div>
          </div>
          {canSubmit ? (
            <div className="flex flex-wrap items-center gap-2 rounded-b-2xl border-t border-[#f0f0f0] px-4 py-4 sm:px-5">
              <button
                type="button"
                onClick={() => {
                  setLeaveMoreMenuOpen(false);
                  setShowLeaveForm((v) => !v);
                  setShowSickForm(false);
                  setShowToilEarnForm(false);
                  setShowCarryoverForm(false);
                  setShowEncashmentForm(false);
                }}
                className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl bg-[var(--org-brand-primary,#121212)] px-4 text-[13px] font-medium text-white hover:bg-[color-mix(in_oklab,var(--org-brand-primary,#121212)_88%,black)]"
              >
                {showLeaveForm ? 'Close' : '+ Book time off'}
              </button>
              <div ref={leaveMoreMenuRef} className="relative">
                <button
                  type="button"
                  id="leave-more-actions-trigger"
                  aria-expanded={leaveMoreMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => setLeaveMoreMenuOpen((o) => !o)}
                  className="inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-xl border border-[#d8d8d8] bg-white px-3.5 text-[13px] font-medium text-[#6b6b6b] hover:bg-[#faf9f6]"
                >
                  More actions
                  <ChevronDown className={`h-4 w-4 shrink-0 opacity-70 transition-transform ${leaveMoreMenuOpen ? 'rotate-180' : ''}`} aria-hidden />
                </button>
                {leaveMoreMenuOpen ? (
                  <div
                    role="menu"
                    aria-labelledby="leave-more-actions-trigger"
                    className="absolute left-0 top-full z-[200] mt-1.5 min-w-[15rem] rounded-xl border border-[#e8e8e8] bg-white py-1 shadow-lg"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center px-3 py-2.5 text-left text-[13px] font-medium text-[#121212] hover:bg-[#f5f4f1]"
                      onClick={() => {
                        setLeaveMoreMenuOpen(false);
                        setShowSickForm((v) => !v);
                        setShowLeaveForm(false);
                        setShowToilEarnForm(false);
                        setShowCarryoverForm(false);
                        setShowEncashmentForm(false);
                      }}
                    >
                      {showSickForm ? 'Close sick day' : 'Log sick day'}
                    </button>
                    {!leaveExempt ? (
                      <>
                        <button
                          type="button"
                          role="menuitem"
                          className="flex w-full items-center px-3 py-2.5 text-left text-[13px] font-medium text-[#121212] hover:bg-[#f5f4f1]"
                          onClick={() => {
                            setLeaveMoreMenuOpen(false);
                            setShowCarryoverForm((v) => !v);
                            setShowLeaveForm(false);
                            setShowSickForm(false);
                            setShowToilEarnForm(false);
                            setShowEncashmentForm(false);
                          }}
                        >
                          {showCarryoverForm ? 'Close carry-over' : 'Request carry-over'}
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="flex w-full items-center px-3 py-2.5 text-left text-[13px] font-medium text-[#121212] hover:bg-[#f5f4f1]"
                          onClick={() => {
                            setLeaveMoreMenuOpen(false);
                            setShowEncashmentForm((v) => !v);
                            setShowLeaveForm(false);
                            setShowSickForm(false);
                            setShowToilEarnForm(false);
                            setShowCarryoverForm(false);
                          }}
                        >
                          {showEncashmentForm ? 'Close encashment' : 'Request encashment'}
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="flex w-full items-center px-3 py-2.5 text-left text-[13px] font-semibold text-[#065f46] hover:bg-[#ecfdf5]"
                          onClick={() => {
                            setLeaveMoreMenuOpen(false);
                            setShowToilEarnForm((v) => !v);
                            setShowLeaveForm(false);
                            setShowSickForm(false);
                            setShowCarryoverForm(false);
                            setShowEncashmentForm(false);
                            setMsg(null);
                          }}
                        >
                          {showToilEarnForm ? 'Close TOIL (overtime)' : 'Add TOIL (overtime)'}
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* Employee leave balance dashboard — ring + palette aligned to payroll-style cards */}
      <section>
        <h2 className="mb-4 text-[12px] font-semibold uppercase tracking-widest text-[#6b6b6b]">Leave balance dashboard</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {/* Annual leave — green (ring = % of annual allowance still unused; matches headline days) */}
          <div className="flex flex-col items-center rounded-2xl border border-[#e8e8e8] bg-white px-4 pb-5 pt-6 text-center shadow-sm">
            <div
              className="relative mb-4 flex h-[88px] w-[88px] items-center justify-center"
              role="img"
              aria-label={`Annual leave: ${annualRemainingPct}% of allowance remaining, ${remaining} days left`}
            >
              <div
                className="pointer-events-none absolute left-1/2 top-0 z-10 h-2 w-2 -translate-x-1/2 rounded-full"
                style={{ backgroundColor: '#1E8E3E' }}
                aria-hidden
              />
              <svg className="absolute inset-0 h-[88px] w-[88px] -rotate-90" viewBox="0 0 80 80" aria-hidden>
                <circle cx="40" cy="40" r="34" fill="none" stroke="#E6F4EA" strokeWidth="8" />
                <circle
                  cx="40"
                  cy="40"
                  r="34"
                  fill="none"
                  stroke="#1E8E3E"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${LEAVE_DASHBOARD_RING_C} ${LEAVE_DASHBOARD_RING_C}`}
                  strokeDashoffset={leaveDashboardRingOffset(annualRemainingPct)}
                  className="transition-[stroke-dashoffset] duration-300 ease-out"
                />
              </svg>
              <span className="relative z-[1] text-[14px] font-bold tabular-nums leading-none text-[#121212]">{annualRemainingPct}%</span>
            </div>
            <p className="text-[32px] font-bold leading-none tracking-tight text-[#121212]">
              {remaining}
              <span className="ml-1 text-[15px] font-semibold text-[#6b6b6b]">days</span>
            </p>
            <p className="mt-2 text-[13px] font-medium text-[#121212]">Annual leave</p>
          </div>

          {/* TOIL — purple (ring = share of TOIL pool still unused; matches balance headline) */}
          <div className="flex flex-col items-center rounded-2xl border border-[#e8e8e8] bg-white px-4 pb-5 pt-6 text-center shadow-sm">
            <div
              className="relative mb-4 flex h-[88px] w-[88px] items-center justify-center"
              role="img"
              aria-label={`TOIL: ${toilRemainingPct}% of earned and booked pool still unused, ${toilBalance} days balance`}
            >
              <div
                className="pointer-events-none absolute left-1/2 top-0 z-10 h-2 w-2 -translate-x-1/2 rounded-full"
                style={{ backgroundColor: '#7C3AED' }}
                aria-hidden
              />
              <svg className="absolute inset-0 h-[88px] w-[88px] -rotate-90" viewBox="0 0 80 80" aria-hidden>
                <circle cx="40" cy="40" r="34" fill="none" stroke="#F3E8FF" strokeWidth="8" />
                <circle
                  cx="40"
                  cy="40"
                  r="34"
                  fill="none"
                  stroke="#7C3AED"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${LEAVE_DASHBOARD_RING_C} ${LEAVE_DASHBOARD_RING_C}`}
                  strokeDashoffset={leaveDashboardRingOffset(toilRemainingPct)}
                  className="transition-[stroke-dashoffset] duration-300 ease-out"
                />
              </svg>
              <span className="relative z-[1] text-[14px] font-bold tabular-nums leading-none text-[#121212]">{toilRemainingPct}%</span>
            </div>
            <p className="text-[32px] font-bold leading-none tracking-tight text-[#121212]">
              {toilBalance}
              <span className="ml-1 text-[15px] font-semibold text-[#6b6b6b]">days</span>
            </p>
            <p className="mt-2 text-[13px] font-medium text-[#121212]">TOIL leave</p>
            <p className="mt-2 max-w-[200px] text-[12px] leading-snug text-[#6b6b6b]">
              {usedToil} day{usedToil === 1 ? '' : 's'} booked or pending.
            </p>
          </div>

          {/* Pending — amber / cream (count in ring, no % ) */}
          <div className="flex flex-col items-center rounded-2xl border border-[#e8e8e8] bg-white px-4 pb-5 pt-6 text-center shadow-sm">
            <div className="relative mb-4 flex h-[88px] w-[88px] items-center justify-center">
              <div
                className="pointer-events-none absolute left-1/2 top-0 z-10 h-2 w-2 -translate-x-1/2 rounded-full"
                style={{ backgroundColor: '#B45309' }}
                aria-hidden
              />
              <svg className="absolute inset-0 h-[88px] w-[88px]" viewBox="0 0 80 80" aria-hidden>
                <circle cx="40" cy="40" r="34" fill="none" stroke="#FFF7ED" strokeWidth="8" />
              </svg>
              <span className="relative z-[1] text-[17px] font-bold tabular-nums leading-none text-[#121212]">{pendingRequestsCount}</span>
            </div>
            <p className="text-[32px] font-bold leading-none tracking-tight text-[#121212]">{pendingRequestsCount}</p>
            <p className="mt-2 text-[13px] font-medium text-[#121212]">Pending requests</p>
            <p className="mt-2 max-w-[200px] text-[12px] leading-snug text-[#6b6b6b]">
              Awaiting approval for dates overlapping this leave year.
            </p>
          </div>

          {/* Upcoming approved — red / rose (count in ring, no % ) */}
          <div className="flex flex-col items-center rounded-2xl border border-[#e8e8e8] bg-white px-4 pb-5 pt-6 text-center shadow-sm">
            <div className="relative mb-4 flex h-[88px] w-[88px] items-center justify-center">
              <div
                className="pointer-events-none absolute left-1/2 top-0 z-10 h-2 w-2 -translate-x-1/2 rounded-full"
                style={{ backgroundColor: '#DC2626' }}
                aria-hidden
              />
              <svg className="absolute inset-0 h-[88px] w-[88px]" viewBox="0 0 80 80" aria-hidden>
                <circle cx="40" cy="40" r="34" fill="none" stroke="#FEF2F2" strokeWidth="8" />
              </svg>
              <span className="relative z-[1] text-[17px] font-bold tabular-nums leading-none text-[#121212]">{approvedUpcomingCount}</span>
            </div>
            <p className="text-[32px] font-bold leading-none tracking-tight text-[#121212]">{approvedUpcomingCount}</p>
            <p className="mt-2 text-[13px] font-medium text-[#121212]">Upcoming approved</p>
            <p className="mt-2 max-w-[200px] text-[12px] leading-snug text-[#6b6b6b]">
              Approved leave still to come, for dates overlapping this leave year.
            </p>
          </div>
        </div>
      </section>
        </>
      )}

      {/* Request TOIL credit (overtime) — manager approval */}
      {showToilEarnForm && canSubmit ? (
        <div className="mb-6 rounded-2xl border border-[#bbf7d0] bg-[#f0fdf9] p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-[15px] font-semibold text-[#121212]">Add TOIL (overtime worked)</h2>
              <p className="mt-1 text-[12px] text-[#6b6b6b]">
                Enter the extra time you worked. Your manager approves before it is added to your TOIL balance.
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 text-[12px] font-medium text-[#121212] underline underline-offset-2 hover:no-underline"
              onClick={() => {
                setShowToilEarnForm(false);
                setShowLeaveForm(true);
                setShowCarryoverForm(false);
                setShowEncashmentForm(false);
              }}
            >
              Book time off instead
            </button>
          </div>
          <form className="space-y-4" onSubmit={(e) => void submitToilEarn(e)}>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-[#6b6b6b]">Date the overtime was worked</span>
              <input
                type="date"
                required
                value={toilEarnWorkDate}
                onChange={(e) => setToilEarnWorkDate(e.target.value)}
                className="w-full max-w-xs rounded-xl border border-[#d8d8d8] bg-white px-3 py-2.5 text-[13px] focus:border-[#121212] focus:outline-none"
              />
            </label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="block flex-1">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#6b6b6b]">Amount</span>
                <input
                  type="number"
                  required
                  min={0}
                  step="any"
                  value={toilEarnAmount}
                  onChange={(e) => setToilEarnAmount(e.target.value)}
                  placeholder="e.g. 1.5"
                  className="w-full rounded-xl border border-[#d8d8d8] bg-white px-3 py-2.5 text-[13px] focus:border-[#121212] focus:outline-none"
                />
              </label>
              <label className="block w-full sm:w-44">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#6b6b6b]">Unit</span>
                <select
                  value={toilEarnUnit}
                  onChange={(e) => setToilEarnUnit(e.target.value as 'minutes' | 'hours' | 'days')}
                  className="w-full rounded-xl border border-[#d8d8d8] bg-white px-3 py-2.5 text-[13px] focus:border-[#121212] focus:outline-none"
                >
                  <option value="minutes">Minutes</option>
                  <option value="hours">Hours</option>
                  <option value="days">Days ({toilMinutesPerDay} min = 1 day)</option>
                </select>
              </label>
            </div>
            {toilEarnAmount && Number(toilEarnAmount) > 0 ? (
              <p className="rounded-lg bg-white px-3 py-2 text-[12.5px] text-[#065f46]">
                ≈ {formatToilMinutes(toilInputToMinutes(Number(toilEarnAmount), toilEarnUnit, toilMinutesPerDay), toilMinutesPerDay)} before approval
              </p>
            ) : null}
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-[#6b6b6b]">Note (optional)</span>
              <input
                type="text"
                value={toilEarnNote}
                onChange={(e) => setToilEarnNote(e.target.value)}
                placeholder="e.g. late shift cover"
                className="w-full rounded-xl border border-[#d8d8d8] bg-white px-3 py-2.5 text-[13px] focus:border-[#121212] focus:outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={busy || !toilEarnWorkDate}
              className="inline-flex h-10 items-center rounded-xl bg-[#008B60] px-5 text-[13px] font-medium text-white disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Submit for approval'}
            </button>
          </form>
        </div>
      ) : null}

      {showCarryoverForm && canSubmit ? (
        <div className="mb-6 rounded-2xl border border-[#e8e8e8] bg-white p-6">
          <h2 className="mb-1 text-[15px] font-semibold text-[#121212]">Request annual leave carry-over</h2>
          <p className="mb-4 text-[12px] text-[#9b9b9b]">Ask to carry unused annual leave into next leave year. Reviewed case by case.</p>
          <form className="space-y-4" onSubmit={(e) => void submitCarryoverRequest(e)}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#6b6b6b]">From leave year</span>
                <select
                  value={carryoverFromYear}
                  onChange={(e) => setCarryoverFromYear(e.target.value)}
                  className="w-full rounded-xl border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13px] focus:border-[#121212] focus:outline-none"
                >
                  <option value="">Select year</option>
                  {yearOptions.map((y) => <option key={`carry-${y}`} value={y}>{y}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#6b6b6b]">Days requested</span>
                <input
                  type="number"
                  required
                  min={0.5}
                  step={0.5}
                  value={carryoverDays}
                  onChange={(e) => setCarryoverDays(e.target.value)}
                  className="w-full rounded-xl border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13px] focus:border-[#121212] focus:outline-none"
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-[#6b6b6b]">Reason (optional)</span>
              <input
                type="text"
                value={carryoverNote}
                onChange={(e) => setCarryoverNote(e.target.value)}
                className="w-full rounded-xl border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13px] focus:border-[#121212] focus:outline-none"
                placeholder="e.g. project deadlines prevented leave usage"
              />
            </label>
            <button
              type="submit"
              disabled={busy || !carryoverFromYear || !carryoverDays}
              className="inline-flex h-10 items-center rounded-xl bg-[var(--org-brand-primary,#121212)] px-5 text-[13px] font-medium text-white disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Send request'}
            </button>
          </form>
        </div>
      ) : null}

      {showEncashmentForm && canSubmit ? (
        <div className="mb-6 rounded-2xl border border-[#e8e8e8] bg-white p-6">
          <h2 className="mb-1 text-[15px] font-semibold text-[#121212]">Request leave encashment</h2>
          <p className="mb-4 text-[12px] text-[#9b9b9b]">Request payout of unused annual leave from a leave year. Reviewed case by case.</p>
          {encashmentAvailable != null ? (
            <p className="mb-4 rounded-lg border border-[#d1fae5] bg-[#ecfdf5] px-3 py-2 text-[12px] text-[#065f46]">
              Encashable days remaining for this leave year (after bookings, carry-over reservations, and pending encashments):{' '}
              <strong className="tabular-nums">{encashmentAvailable}</strong>
            </p>
          ) : null}
          <form className="space-y-4" onSubmit={(e) => void submitEncashmentRequest(e)}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#6b6b6b]">Leave year</span>
                <select
                  value={encashmentYear}
                  onChange={(e) => setEncashmentYear(e.target.value)}
                  className="w-full rounded-xl border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13px] focus:border-[#121212] focus:outline-none"
                >
                  <option value="">Select year</option>
                  {yearOptions.map((y) => <option key={`encash-${y}`} value={y}>{y}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#6b6b6b]">Days requested</span>
                <input
                  type="number"
                  required
                  min={0.5}
                  step={0.5}
                  value={encashmentDays}
                  onChange={(e) => setEncashmentDays(e.target.value)}
                  className="w-full rounded-xl border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13px] focus:border-[#121212] focus:outline-none"
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-[#6b6b6b]">Reason (optional)</span>
              <input
                type="text"
                value={encashmentNote}
                onChange={(e) => setEncashmentNote(e.target.value)}
                className="w-full rounded-xl border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13px] focus:border-[#121212] focus:outline-none"
                placeholder="e.g. business-critical delivery period"
              />
            </label>
            <button
              type="submit"
              disabled={busy || !encashmentYear || !encashmentDays}
              className="inline-flex h-10 items-center rounded-xl bg-[var(--org-brand-primary,#121212)] px-5 text-[13px] font-medium text-white disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Send request'}
            </button>
          </form>
        </div>
      ) : null}

      {/* Leave request form — compact grid layout aligned to payroll-style booking */}
      {showLeaveForm && canSubmit ? (
        <div className="mb-6 rounded-2xl border border-[#e8e8e8] bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-[#f0f0f0] pb-5">
            <h2 className="font-authSerif text-[22px] font-semibold tracking-[-0.02em] text-[#121212]">Book time off</h2>
            {!leaveExempt ? (
              <button
                type="button"
                className="shrink-0 text-[13px] font-medium text-[#065f46] underline decoration-[#065f46]/40 underline-offset-4 hover:text-[#047857] hover:decoration-[#047857]"
                onClick={() => {
                  setShowLeaveForm(false);
                  setShowToilEarnForm(true);
                  setShowCarryoverForm(false);
                  setShowEncashmentForm(false);
                  setMsg(null);
                }}
              >
                + Add TOIL (overtime)
              </button>
            ) : null}
          </div>
          <form className="space-y-6" onSubmit={(e) => void submitLeave(e)}>
            {leaveExempt ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] leading-relaxed text-amber-950">
                Your HR record is marked without paid annual leave entitlement — book unpaid or other leave types, or log sick days (with a rota shift on those dates).
              </p>
            ) : null}
            <div>
              <p className="mb-2.5 text-[12px] text-[#6b6b6b]">Leave type</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {bookLeaveKindRows.row1.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setFormKind(k);
                      if (k !== 'parental') setFormParentalSubtype('maternity');
                    }}
                    className={`rounded-lg border py-2.5 text-[13px] font-medium transition-colors ${
                      formKind === k
                        ? 'border-[var(--org-brand-primary,#121212)] bg-[var(--org-brand-primary,#121212)] text-white'
                        : 'border-[#e0e0e0] bg-white text-[#121212] hover:border-[#bdbdbd]'
                    }`}
                  >
                    {leaveKindShortLabel(k)}
                  </button>
                ))}
              </div>
              {bookLeaveKindRows.row2.length > 0 ? (
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {bookLeaveKindRows.row2.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        setFormKind(k);
                        if (k !== 'parental') setFormParentalSubtype('maternity');
                      }}
                      className={`rounded-lg border py-2.5 text-[13px] font-medium transition-colors ${
                        formKind === k
                          ? 'border-[var(--org-brand-primary,#121212)] bg-[var(--org-brand-primary,#121212)] text-white'
                          : 'border-[#e0e0e0] bg-white text-[#121212] hover:border-[#bdbdbd]'
                      }`}
                    >
                      {leaveKindShortLabel(k)}
                    </button>
                  ))}
                </div>
              ) : null}
              {(() => {
                const hint = leaveKindBookingHint(formKind);
                return hint ? <p className="mt-2.5 text-[12px] leading-snug text-[#6b6b6b]">{hint}</p> : null;
              })()}
            </div>
            {formKind === 'parental' ? (
              <label className="block">
                <span className="mb-1.5 block text-[12px] text-[#6b6b6b]">Parental leave type</span>
                <div className="relative">
                  <select
                    value={formParentalSubtype}
                    onChange={(e) => setFormParentalSubtype(e.target.value as ParentalSubtype)}
                    className="w-full appearance-none rounded-lg border border-[#e0e0e0] bg-white py-2.5 pl-3 pr-10 text-[13px] text-[#121212] shadow-sm focus:border-[#121212] focus:outline-none focus:ring-2 focus:ring-[#121212]/10"
                  >
                    <option value="maternity">Maternity</option>
                    <option value="paternity">Paternity</option>
                    <option value="adoption">Adoption</option>
                    <option value="shared_parental">Shared parental</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#737373]" aria-hidden />
                </div>
              </label>
            ) : null}
            {SUPPORTING_DOC_LEAVE_KINDS.includes(formKind) ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-[12px] text-[#6b6b6b]">Supporting document type</span>
                  <div className="relative">
                    <select
                      value={formSupportingDocKind}
                      onChange={(e) => setFormSupportingDocKind(e.target.value as LeaveRequestDocument['document_kind'])}
                      className="w-full appearance-none rounded-lg border border-[#e0e0e0] bg-white py-2.5 pl-3 pr-10 text-[13px] text-[#121212] shadow-sm focus:border-[#121212] focus:outline-none focus:ring-2 focus:ring-[#121212]/10"
                    >
                      <option value="fit_note">Fit note</option>
                      <option value="medical_letter">Medical letter</option>
                      <option value="adoption_document">Adoption document</option>
                      <option value="bereavement_evidence">Bereavement evidence</option>
                      <option value="other">Other</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#737373]" aria-hidden />
                  </div>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[12px] text-[#6b6b6b]">Supporting file (optional)</span>
                  <input
                    type="file"
                    onChange={(e) => setFormSupportingDoc(e.target.files?.[0] ?? null)}
                    className="w-full rounded-lg border border-[#e0e0e0] bg-white px-3 py-2 text-[12px] file:mr-3 file:rounded-md file:border-0 file:bg-[#f5f5f5] file:px-2 file:py-1 file:text-[12px] focus:border-[#121212] focus:outline-none focus:ring-2 focus:ring-[#121212]/10"
                  />
                </label>
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[12px] text-[#6b6b6b]">First day off</span>
                <div className="relative">
                  <input
                    type="date"
                    required
                    value={formStart}
                    onChange={(e) => setFormStart(e.target.value)}
                    className="w-full rounded-lg border border-[#e0e0e0] bg-white py-2.5 pl-3 pr-10 text-[13px] text-[#121212] shadow-sm [color-scheme:light] focus:border-[#121212] focus:outline-none focus:ring-2 focus:ring-[#121212]/10"
                  />
                  <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9b9b9b]" aria-hidden />
                </div>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] text-[#6b6b6b]">Last day off</span>
                <div className="relative">
                  <input
                    type="date"
                    required
                    min={formStart}
                    value={formDayMode === 'half' ? formStart : formEnd}
                    disabled={formDayMode === 'half'}
                    onChange={(e) => setFormEnd(e.target.value)}
                    className="w-full rounded-lg border border-[#e0e0e0] bg-white py-2.5 pl-3 pr-10 text-[13px] text-[#121212] shadow-sm [color-scheme:light] focus:border-[#121212] focus:outline-none focus:ring-2 focus:ring-[#121212]/10 disabled:cursor-not-allowed disabled:bg-[#fafafa] disabled:opacity-70"
                  />
                  <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9b9b9b]" aria-hidden />
                </div>
              </label>
            </div>
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-[12px] text-[#6b6b6b]">Duration</span>
                <div className="relative">
                  <select
                    value={formDayMode}
                    onChange={(e) => setFormDayMode(e.target.value as 'full' | 'half')}
                    className="w-full appearance-none rounded-lg border border-[#e0e0e0] bg-white py-2.5 pl-3 pr-10 text-[13px] text-[#121212] shadow-sm focus:border-[#121212] focus:outline-none focus:ring-2 focus:ring-[#121212]/10"
                  >
                    <option value="full">Full day(s)</option>
                    <option value="half">Half day</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#737373]" aria-hidden />
                </div>
              </label>
              {formDayMode === 'half' ? (
                <label className="block sm:max-w-md">
                  <span className="mb-1.5 block text-[12px] text-[#6b6b6b]">Half-day slot</span>
                  <div className="relative">
                    <select
                      value={formHalfDayPortion}
                      onChange={(e) => setFormHalfDayPortion(e.target.value as 'am' | 'pm')}
                      className="w-full appearance-none rounded-lg border border-[#e0e0e0] bg-white py-2.5 pl-3 pr-10 text-[13px] text-[#121212] shadow-sm focus:border-[#121212] focus:outline-none focus:ring-2 focus:ring-[#121212]/10"
                    >
                      <option value="am">Morning (AM)</option>
                      <option value="pm">Afternoon (PM)</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#737373]" aria-hidden />
                  </div>
                </label>
              ) : null}
            </div>
            {formStart && formEnd && formEnd >= formStart ? (
              <p
                className={[
                  'rounded-lg px-3 py-2.5 text-[12.5px] font-medium leading-relaxed',
                  newLeaveOverlaps || exceedsAnnualAllowance ? 'bg-[#fef2f2] text-[#b91c1c]' : 'bg-[#f0fdf9] text-[#166534]',
                ].join(' ')}
              >
                {daysLabel(formStart, formEnd)}
                {formKind === 'annual' && leaveUseWorkingDays ? (
                  requestedDaysInLeaveYear > 0 ? (
                    <>{` · ${requestedDaysInLeaveYear} working leave day${requestedDaysInLeaveYear === 1 ? '' : 's'} in leave year ${year}`}</>
                  ) : (
                    <>{` · No working leave days in leave year ${year} for this range`}</>
                  )
                ) : null}
                {formKind === 'annual' && !leaveUseWorkingDays && formTripDays !== calendarDaysInLeaveYearForForm ? (
                  calendarDaysInLeaveYearForForm > 0 ? (
                    <>{` · ${calendarDaysInLeaveYearForForm} calendar day${calendarDaysInLeaveYearForForm === 1 ? '' : 's'} in leave year ${year}`}</>
                  ) : (
                    <>{` · None of these days fall in leave year ${year} (adjust dates or switch year above)`}</>
                  )
                ) : null}
                {formKind === 'toil' && leaveUseWorkingDays ? (
                  <>{` · ${requestedDaysInLeaveYear} working day${requestedDaysInLeaveYear === 1 ? '' : 's'} in leave year ${year} toward TOIL`}</>
                ) : null}
                {formKind === 'annual'
                  ? ` · ${Math.max(0, projectedAnnualRemaining)} day${Math.max(0, projectedAnnualRemaining) === 1 ? '' : 's'} remaining after this`
                  : formKind === 'toil'
                    ? ` · ${toilBalance} TOIL day${toilBalance === 1 ? '' : 's'} available`
                    : ' · Submitted for manager approval'}
                {newLeaveOverlaps ? ' · Overlaps another leave booking' : ''}
                {exceedsAnnualAllowance
                  ? ` · Exceeds your allowance by ${Math.abs(projectedAnnualRemaining)} day${Math.abs(projectedAnnualRemaining) === 1 ? '' : 's'}`
                  : ''}
              </p>
            ) : null}
            <label className="block">
              <span className="mb-1.5 block text-[12px] text-[#6b6b6b]">Note (optional)</span>
              <input
                type="text"
                placeholder="e.g. family holiday"
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                className="w-full rounded-lg border border-[#e0e0e0] bg-white px-3 py-2.5 text-[13px] text-[#121212] placeholder:text-[#a3a3a3] shadow-sm focus:border-[#121212] focus:outline-none focus:ring-2 focus:ring-[#121212]/10"
              />
            </label>
            <div className="pt-1">
              <button
                type="submit"
                disabled={busy || !formStart || !formEnd || exceedsAnnualAllowance || newLeaveOverlaps}
                className="inline-flex h-11 min-w-[8rem] items-center justify-center rounded-lg bg-[var(--org-brand-primary,#121212)] px-6 text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-[color-mix(in_oklab,var(--org-brand-primary,#121212)_88%,black)] disabled:opacity-50"
              >
                {busy ? 'Sending…' : 'Send request'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* Sick day form */}
      {showSickForm && canSubmit ? (
        <div className="mb-6 rounded-2xl border border-[#e8e8e8] bg-white p-6">
          <h2 className="mb-1 text-[15px] font-semibold text-[#121212]">Log sick days</h2>
          <p className="mb-4 text-[12px] text-[#9b9b9b]">Sick days don&apos;t use your annual leave — no approval needed.</p>
          {leaveExempt ? (
            <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-950">
              For your contract, you can only log sick or absence on dates where you have a scheduled rota shift covering that day.
            </p>
          ) : null}
          <form className="space-y-4" onSubmit={(e) => void submitSickness(e)}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#6b6b6b]">First day sick</span>
                <input type="date" required value={sickStart} onChange={(e) => setSickStart(e.target.value)} className="w-full rounded-xl border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13px] focus:border-[#121212] focus:outline-none" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#6b6b6b]">Last day sick</span>
                <input type="date" required min={sickStart} value={sickDayMode === 'half' ? sickStart : sickEnd} disabled={sickDayMode === 'half'} onChange={(e) => setSickEnd(e.target.value)} className="w-full rounded-xl border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13px] focus:border-[#121212] focus:outline-none disabled:opacity-60" />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#6b6b6b]">Duration</span>
                <select
                  value={sickDayMode}
                  onChange={(e) => setSickDayMode(e.target.value as 'full' | 'half')}
                  className="w-full rounded-xl border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13px] focus:border-[#121212] focus:outline-none"
                >
                  <option value="full">Full day(s)</option>
                  <option value="half">Half day</option>
                </select>
              </label>
              {sickDayMode === 'half' ? (
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#6b6b6b]">Half-day slot</span>
                  <select
                    value={sickHalfDayPortion}
                    onChange={(e) => setSickHalfDayPortion(e.target.value as 'am' | 'pm')}
                    className="w-full rounded-xl border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13px] focus:border-[#121212] focus:outline-none"
                  >
                    <option value="am">Morning (AM)</option>
                    <option value="pm">Afternoon (PM)</option>
                  </select>
                </label>
              ) : <div />}
            </div>
            {sickStart && sickEnd && sickEnd >= sickStart ? (
              <p className="rounded-lg bg-[#faf9f6] px-3 py-2 text-[12.5px] text-[#6b6b6b]">{daysLabel(sickStart, sickEnd)}</p>
            ) : null}
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-[#6b6b6b]">Notes (optional)</span>
              <input type="text" placeholder="e.g. flu, GP appointment" value={sickNotes} onChange={(e) => setSickNotes(e.target.value)} className="w-full rounded-xl border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13px] focus:border-[#121212] focus:outline-none" />
            </label>
            <button type="submit" disabled={busy || !sickStart || !sickEnd} className="inline-flex h-10 items-center rounded-xl bg-[var(--org-brand-primary,#121212)] px-5 text-[13px] font-medium text-white disabled:opacity-50">
              {busy ? 'Saving…' : 'Save'}
            </button>
          </form>
        </div>
      ) : null}

      {editTarget ? (
        <div className="mb-6 rounded-2xl border border-[#e8e8e8] bg-white p-6">
          <h2 className="mb-4 text-[15px] font-semibold text-[#121212]">Request changes to approved leave</h2>
          <p className="mb-4 text-[12px] text-[#9b9b9b]">
            This sends an edit request for manager approval.
          </p>
          <form className="space-y-4" onSubmit={(e) => void requestEditApproval(e)}>
            <div>
              <span className="mb-1.5 block text-[12px] text-[#6b6b6b]">Leave type</span>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {bookLeaveKindRows.row1.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setEditKind(k);
                      if (k !== 'parental') setEditParentalSubtype('maternity');
                    }}
                    className={`rounded-lg border py-2.5 text-[13px] font-medium transition-colors ${
                      editKind === k
                        ? 'border-[var(--org-brand-primary,#121212)] bg-[var(--org-brand-primary,#121212)] text-white'
                        : 'border-[#e0e0e0] bg-white text-[#121212] hover:border-[#bdbdbd]'
                    }`}
                  >
                    {leaveKindShortLabel(k)}
                  </button>
                ))}
              </div>
              {bookLeaveKindRows.row2.length > 0 ? (
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {bookLeaveKindRows.row2.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        setEditKind(k);
                        if (k !== 'parental') setEditParentalSubtype('maternity');
                      }}
                      className={`rounded-lg border py-2.5 text-[13px] font-medium transition-colors ${
                        editKind === k
                          ? 'border-[var(--org-brand-primary,#121212)] bg-[var(--org-brand-primary,#121212)] text-white'
                          : 'border-[#e0e0e0] bg-white text-[#121212] hover:border-[#bdbdbd]'
                      }`}
                    >
                      {leaveKindShortLabel(k)}
                    </button>
                  ))}
                </div>
              ) : null}
              {(() => {
                const hint = leaveKindBookingHint(editKind);
                return hint ? <p className="mt-2.5 text-[12px] leading-snug text-[#6b6b6b]">{hint}</p> : null;
              })()}
            </div>
            {editKind === 'parental' ? (
              <label className="block">
                <span className="mb-1.5 block text-[12px] text-[#6b6b6b]">Parental leave type</span>
                <div className="relative">
                  <select
                    value={editParentalSubtype}
                    onChange={(e) => setEditParentalSubtype(e.target.value as ParentalSubtype)}
                    className="w-full appearance-none rounded-lg border border-[#e0e0e0] bg-white py-2.5 pl-3 pr-10 text-[13px] text-[#121212] shadow-sm focus:border-[#121212] focus:outline-none focus:ring-2 focus:ring-[#121212]/10"
                  >
                    <option value="maternity">Maternity</option>
                    <option value="paternity">Paternity</option>
                    <option value="adoption">Adoption</option>
                    <option value="shared_parental">Shared parental</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#737373]" aria-hidden />
                </div>
              </label>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[12px] text-[#6b6b6b]">First day off</span>
                <div className="relative">
                  <input
                    type="date"
                    required
                    value={editStart}
                    onChange={(e) => setEditStart(e.target.value)}
                    className="w-full rounded-lg border border-[#e0e0e0] bg-white py-2.5 pl-3 pr-10 text-[13px] text-[#121212] shadow-sm [color-scheme:light] focus:border-[#121212] focus:outline-none focus:ring-2 focus:ring-[#121212]/10"
                  />
                  <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9b9b9b]" aria-hidden />
                </div>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] text-[#6b6b6b]">Last day off</span>
                <div className="relative">
                  <input
                    type="date"
                    required
                    min={editStart}
                    value={editDayMode === 'half' ? editStart : editEnd}
                    disabled={editDayMode === 'half'}
                    onChange={(e) => setEditEnd(e.target.value)}
                    className="w-full rounded-lg border border-[#e0e0e0] bg-white py-2.5 pl-3 pr-10 text-[13px] text-[#121212] shadow-sm [color-scheme:light] focus:border-[#121212] focus:outline-none focus:ring-2 focus:ring-[#121212]/10 disabled:cursor-not-allowed disabled:bg-[#fafafa] disabled:opacity-70"
                  />
                  <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9b9b9b]" aria-hidden />
                </div>
              </label>
            </div>
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-[12px] text-[#6b6b6b]">Duration</span>
                <div className="relative">
                  <select
                    value={editDayMode}
                    onChange={(e) => setEditDayMode(e.target.value as 'full' | 'half')}
                    className="w-full appearance-none rounded-lg border border-[#e0e0e0] bg-white py-2.5 pl-3 pr-10 text-[13px] text-[#121212] shadow-sm focus:border-[#121212] focus:outline-none focus:ring-2 focus:ring-[#121212]/10"
                  >
                    <option value="full">Full day(s)</option>
                    <option value="half">Half day</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#737373]" aria-hidden />
                </div>
              </label>
              {editDayMode === 'half' ? (
                <label className="block sm:max-w-md">
                  <span className="mb-1.5 block text-[12px] text-[#6b6b6b]">Half-day slot</span>
                  <div className="relative">
                    <select
                      value={editHalfDayPortion}
                      onChange={(e) => setEditHalfDayPortion(e.target.value as 'am' | 'pm')}
                      className="w-full appearance-none rounded-lg border border-[#e0e0e0] bg-white py-2.5 pl-3 pr-10 text-[13px] text-[#121212] shadow-sm focus:border-[#121212] focus:outline-none focus:ring-2 focus:ring-[#121212]/10"
                    >
                      <option value="am">Morning (AM)</option>
                      <option value="pm">Afternoon (PM)</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#737373]" aria-hidden />
                  </div>
                </label>
              ) : null}
            </div>
            <label className="block">
              <span className="mb-1.5 block text-[12px] text-[#6b6b6b]">Note (optional)</span>
              <input
                type="text"
                placeholder="e.g. family holiday"
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                className="w-full rounded-lg border border-[#e0e0e0] bg-white px-3 py-2.5 text-[13px] text-[#121212] placeholder:text-[#a3a3a3] shadow-sm focus:border-[#121212] focus:outline-none focus:ring-2 focus:ring-[#121212]/10"
              />
            </label>
            {editStart && editEnd && editEnd >= editStart ? (
              <p
                className={[
                  'rounded-lg px-3 py-2.5 text-[12.5px] font-medium leading-relaxed',
                  editLeaveOverlaps ? 'bg-[#fef2f2] text-[#b91c1c]' : 'bg-[#f0fdf9] text-[#166534]',
                ].join(' ')}
              >
                {daysLabel(editStart, editEnd)}
                {editLeaveOverlaps ? ' · Overlaps another leave booking' : ' · Submitted for manager approval'}
              </p>
            ) : null}
            {editStart && editEnd && editEnd >= editStart && editLeaveOverlaps ? (
              <p className="rounded-lg bg-[#fef2f2] px-3 py-2 text-[12.5px] font-medium text-[#b91c1c]">
                These dates overlap another leave booking. Adjust the range or resolve the other request first.
              </p>
            ) : null}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={busy || !editStart || !editEnd || editLeaveOverlaps}
                className="inline-flex h-11 min-w-[8rem] items-center justify-center rounded-lg bg-[var(--org-brand-primary,#121212)] px-6 text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-[color-mix(in_oklab,var(--org-brand-primary,#121212)_88%,black)] disabled:opacity-50"
              >
                {busy ? 'Sending…' : 'Send edit request'}
              </button>
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className="inline-flex h-11 items-center justify-center rounded-lg border border-[#e0e0e0] bg-white px-6 text-[13px] font-medium text-[#121212] shadow-sm transition-colors hover:bg-[#fafafa]"
              >
                Close
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* Pending approvals (leave + TOIL credits) */}
      {(canApprove || canManage) && mergedApprovalQueue.length > 0 ? (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Pending approval</h2>
            <span className="rounded-full border border-[#e8e8e8] bg-white px-2.5 py-0.5 text-[11px] font-semibold text-[#6b6b6b]">{mergedApprovalQueue.length}</span>
          </div>
          <div className="mb-3 rounded-xl border border-[#e8e8e8] bg-white p-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedApprovalKeys(mergedApprovalQueue.map((r) => r.key))}
                className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[12px] text-[#6b6b6b] hover:bg-[#f5f4f1]"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setSelectedApprovalKeys([])}
                className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[12px] text-[#6b6b6b] hover:bg-[#f5f4f1]"
              >
                Clear
              </button>
              <span className="text-[12px] text-[#6b6b6b]">{selectedApprovalKeys.length} selected</span>
            </div>
            <label className="mt-2 block">
              <span className="mb-1 block text-[11px] font-medium text-[#9b9b9b]">Bulk decision note (optional)</span>
              <input
                type="text"
                value={bulkApprovalNote}
                onChange={(e) => setBulkApprovalNote(e.target.value)}
                placeholder="e.g. approved after weekly review"
                className="w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[12px] focus:border-[#121212] focus:outline-none"
              />
            </label>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={busy || selectedApprovalKeys.length === 0}
                onClick={() => void submitBulkApprovalDecision(true)}
                className="rounded-lg bg-[var(--org-brand-primary,#121212)] px-3 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[color-mix(in_oklab,var(--org-brand-primary,#121212)_88%,black)] disabled:opacity-50"
              >
                Approve selected
              </button>
              <button
                type="button"
                disabled={busy || selectedApprovalKeys.length === 0}
                onClick={() => void submitBulkApprovalDecision(false)}
                className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[12px] font-semibold text-[#6b6b6b] transition-colors hover:bg-[#fafafa] disabled:opacity-50"
              >
                Reject selected
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {mergedApprovalQueue.map((row) =>
              row.kind === 'leave' ? (
                <div key={row.key} className="flex flex-col gap-3 rounded-2xl border border-[#e8e8e8] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <label className="mb-1 inline-flex items-center gap-2 text-[11px] text-[#6b6b6b]">
                      <input
                        type="checkbox"
                        checked={selectedApprovalKeys.includes(row.key)}
                        onChange={(e) =>
                          setSelectedApprovalKeys((prev) =>
                            e.target.checked ? [...prev, row.key] : prev.filter((k) => k !== row.key),
                          )
                        }
                      />
                      Select
                    </label>
                    <p className="font-semibold text-[#121212]">{displayName(row.leave)}</p>
                    <p className="mt-0.5 text-[12.5px] text-[#6b6b6b]">
                      {leaveKindLabel(row.leave.kind)}{row.leave.kind === 'parental' && row.leave.parental_subtype ? ` (${parentalSubtypeLabel(row.leave.parental_subtype)})` : ''} &middot; {fmtDate(row.leave.start_date)} – {fmtDate(row.leave.end_date)} &middot; {daysLabel(row.leave.start_date, row.leave.end_date)}
                    </p>
                    {row.leave.status === 'pending_edit' && row.leave.proposed_start_date && row.leave.proposed_end_date ? (
                      <p className="mt-1 text-[12px] text-[#6b6b6b]">
                        Requested edit to {leaveKindLabel(row.leave.proposed_kind ?? row.leave.kind)}{(row.leave.proposed_kind ?? row.leave.kind) === 'parental' && row.leave.proposed_parental_subtype ? ` (${parentalSubtypeLabel(row.leave.proposed_parental_subtype)})` : ''} &middot; {fmtDate(row.leave.proposed_start_date)} – {fmtDate(row.leave.proposed_end_date)}
                        {row.leave.proposed_note ? ` · "${row.leave.proposed_note}"` : ''}
                      </p>
                    ) : null}
                    {row.leave.status === 'pending_cancel' ? (
                      <p className="mt-1.5 text-[12px] leading-relaxed text-[#6b6b6b]">
                        Cancellation requested for this approved leave.
                      </p>
                    ) : null}
                    {row.leave.note ? <p className="mt-1 text-[12px] italic text-[#9b9b9b]">&ldquo;{row.leave.note}&rdquo;</p> : null}
                    {documentsByRequestId[row.leave.id]?.length ? (
                      <div className="mt-1 flex flex-wrap gap-2">
                        {documentsByRequestId[row.leave.id].map((d) => (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => void openSupportingDocument(d)}
                            className="rounded-lg border border-[#d8d8d8] bg-white px-2 py-1 text-[11px] text-[#6b6b6b] hover:bg-[#f5f4f1]"
                          >
                            {supportingDocKindLabel(d.document_kind)}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" disabled={busy} onClick={() => openApprovalDialog('leave', row.leave.id, true)} className="rounded-xl bg-[var(--org-brand-primary,#121212)] px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50 hover:bg-[color-mix(in_oklab,var(--org-brand-primary,#121212)_88%,black)]">
                      Approve
                    </button>
                    <button type="button" disabled={busy} onClick={() => openApprovalDialog('leave', row.leave.id, false)} className="rounded-xl border border-[#d8d8d8] bg-white px-4 py-2 text-[12.5px] font-medium text-[#6b6b6b] disabled:opacity-50 hover:bg-[#fafafa]">
                      Reject
                    </button>
                  </div>
                </div>
              ) : row.kind === 'toil' ? (
                <div key={row.key} className="flex flex-col gap-3 rounded-2xl border border-[#e8e8e8] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <label className="mb-1 inline-flex items-center gap-2 text-[11px] text-[#6b6b6b]">
                      <input
                        type="checkbox"
                        checked={selectedApprovalKeys.includes(row.key)}
                        onChange={(e) =>
                          setSelectedApprovalKeys((prev) =>
                            e.target.checked ? [...prev, row.key] : prev.filter((k) => k !== row.key),
                          )
                        }
                      />
                      Select
                    </label>
                    <p className="font-semibold text-[#121212]">{displayName(row.toil)}</p>
                    <p className="mt-0.5 text-[12.5px] text-[#6b6b6b]">
                      TOIL credit (overtime) &middot; worked {fmtDate(row.toil.work_date)} &middot; {formatToilMinutes(row.toil.minutes_earned, toilMinutesPerDay)}
                    </p>
                    {row.toil.note ? <p className="mt-1 text-[12px] italic text-[#9b9b9b]">&ldquo;{row.toil.note}&rdquo;</p> : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" disabled={busy} onClick={() => openApprovalDialog('toil_credit', row.toil.id, true)} className="rounded-xl bg-[var(--org-brand-primary,#121212)] px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50 hover:bg-[color-mix(in_oklab,var(--org-brand-primary,#121212)_88%,black)]">
                      Approve
                    </button>
                    <button type="button" disabled={busy} onClick={() => openApprovalDialog('toil_credit', row.toil.id, false)} className="rounded-xl border border-[#d8d8d8] bg-white px-4 py-2 text-[12.5px] font-medium text-[#6b6b6b] disabled:opacity-50 hover:bg-[#fafafa]">
                      Reject
                    </button>
                  </div>
                </div>
              ) : row.kind === 'carryover' ? (
                <div key={row.key} className="flex flex-col gap-3 rounded-2xl border border-[#e8e8e8] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <label className="mb-1 inline-flex items-center gap-2 text-[11px] text-[#6b6b6b]">
                      <input
                        type="checkbox"
                        checked={selectedApprovalKeys.includes(row.key)}
                        onChange={(e) =>
                          setSelectedApprovalKeys((prev) =>
                            e.target.checked ? [...prev, row.key] : prev.filter((k) => k !== row.key),
                          )
                        }
                      />
                      Select
                    </label>
                    <p className="font-semibold text-[#121212]">{displayName(row.carryover)}</p>
                    <p className="mt-0.5 text-[12.5px] text-[#6b6b6b]">
                      Carry-over request &middot; {row.carryover.days_requested} day{row.carryover.days_requested === 1 ? '' : 's'} from {row.carryover.from_leave_year} to {row.carryover.to_leave_year}
                    </p>
                    {row.carryover.note ? <p className="mt-1 text-[12px] italic text-[#9b9b9b]">&ldquo;{row.carryover.note}&rdquo;</p> : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" disabled={busy} onClick={() => openApprovalDialog('carryover', row.carryover.id, true)} className="rounded-xl bg-[var(--org-brand-primary,#121212)] px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50 hover:bg-[color-mix(in_oklab,var(--org-brand-primary,#121212)_88%,black)]">
                      Approve
                    </button>
                    <button type="button" disabled={busy} onClick={() => openApprovalDialog('carryover', row.carryover.id, false)} className="rounded-xl border border-[#d8d8d8] bg-white px-4 py-2 text-[12.5px] font-medium text-[#6b6b6b] disabled:opacity-50 hover:bg-[#fafafa]">
                      Reject
                    </button>
                  </div>
                </div>
              ) : (
                <div key={row.key} className="flex flex-col gap-3 rounded-2xl border border-[#e8e8e8] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <label className="mb-1 inline-flex items-center gap-2 text-[11px] text-[#6b6b6b]">
                      <input
                        type="checkbox"
                        checked={selectedApprovalKeys.includes(row.key)}
                        onChange={(e) =>
                          setSelectedApprovalKeys((prev) =>
                            e.target.checked ? [...prev, row.key] : prev.filter((k) => k !== row.key),
                          )
                        }
                      />
                      Select
                    </label>
                    <p className="font-semibold text-[#121212]">{displayName(row.encashment)}</p>
                    <p className="mt-0.5 text-[12.5px] text-[#6b6b6b]">
                      Encashment request &middot; {row.encashment.days_requested} day{row.encashment.days_requested === 1 ? '' : 's'} from leave year {row.encashment.leave_year}
                    </p>
                    {row.encashment.note ? <p className="mt-1 text-[12px] italic text-[#9b9b9b]">&ldquo;{row.encashment.note}&rdquo;</p> : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" disabled={busy} onClick={() => openApprovalDialog('encashment', row.encashment.id, true)} className="rounded-xl bg-[var(--org-brand-primary,#121212)] px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50 hover:bg-[color-mix(in_oklab,var(--org-brand-primary,#121212)_88%,black)]">
                      Approve
                    </button>
                    <button type="button" disabled={busy} onClick={() => openApprovalDialog('encashment', row.encashment.id, false)} className="rounded-xl border border-[#d8d8d8] bg-white px-4 py-2 text-[12.5px] font-medium text-[#6b6b6b] disabled:opacity-50 hover:bg-[#fafafa]">
                      Reject
                    </button>
                  </div>
                </div>
              ),
            )}
          </div>
        </section>
      ) : null}

      {(canApprove || canManage) ? (
        <section>
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Team absence calendar</h2>
            <div className="flex flex-wrap items-center gap-2">
              {teamCalendarDeptOptions.length > 0 ? (
                <label className="flex items-center gap-1.5 text-[12px] text-[#6b6b6b]">
                  <span className="whitespace-nowrap">Department</span>
                  <select
                    value={teamCalendarDeptFilter}
                    onChange={(e) => setTeamCalendarDeptFilter(e.target.value as 'all' | string)}
                    className="max-w-[min(100vw-2rem,220px)] rounded-lg border border-[#d8d8d8] bg-white px-2 py-1.5 text-[12px] text-[#121212] focus:border-[#121212] focus:outline-none"
                  >
                    <option value="all">All departments</option>
                    {teamCalendarDeptOptions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setCalendarMonth((v) => shiftMonthKey(v, -1))} className="rounded-lg border border-[#d8d8d8] bg-white px-2 py-1 text-[12px] text-[#6b6b6b] hover:bg-[#f5f4f1]">Prev</button>
                <span className="min-w-[9rem] text-center text-[12px] font-medium text-[#6b6b6b]">{monthGrid.monthLabel}</span>
                <button type="button" onClick={() => setCalendarMonth((v) => shiftMonthKey(v, 1))} className="rounded-lg border border-[#d8d8d8] bg-white px-2 py-1 text-[12px] text-[#6b6b6b] hover:bg-[#f5f4f1]">Next</button>
              </div>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-[#e8e8e8] bg-white p-3">
            <div className="mb-2 grid grid-cols-7 gap-2 text-center text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
              <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: monthGrid.leadingBlanks }).map((_, i) => <div key={`b-${i}`} className="min-h-[92px] rounded-lg bg-[#faf9f6]" />)}
              {monthGrid.days.map((d) => (
                <div key={d.iso} className="min-h-[92px] rounded-lg border border-[#f0f0f0] bg-[#faf9f6] p-2">
                  <p className="text-[11px] font-semibold text-[#6b6b6b]">{d.day}</p>
                  <div className="mt-1 space-y-1">
                    {d.rows.slice(0, 2).map((r) => (
                      <p key={`${d.iso}-${r.id}`} className="truncate rounded bg-[#e8f3ff] px-1.5 py-0.5 text-[10.5px] text-[#1e3a8a]">
                        {r.requester_name} · {leaveKindLabel(r.kind)}
                      </p>
                    ))}
                    {d.rows.length > 2 ? <p className="text-[10px] text-[#9b9b9b]">+{d.rows.length - 2} more</p> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

        </div>
        <aside className="min-w-0 space-y-6 lg:col-span-4">

      {/* My requests */}
      <section>
        <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">My requests</h2>
        <p className="mb-3 text-[11px] leading-snug text-[#9b9b9b]">
          All requests, newest first. Balances and the dashboard above count only bookings that overlap{' '}
          <span className="font-medium text-[#6b6b6b]">{selectedLeavePeriodLabel}</span>{' '}
          (the dropdown label is the year the leave year <span className="italic">starts</span>, not the calendar year of every date below).
        </p>
        {myRequests.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#d8d8d8] px-6 py-10 text-center">
            <p className="text-[13px] text-[#9b9b9b]">No leave requests yet. Use &ldquo;Book time off&rdquo; above to get started.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[#e8e8e8] bg-white">
            {myRequests.map((r, i) => (
              <div key={r.id} className={`flex flex-col gap-1.5 px-5 py-4 ${i > 0 ? 'border-t border-[#f0f0f0]' : ''}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-medium text-[#121212]">{leaveKindLabel(r.kind)}</span>
                    <StatusPill status={r.status} />
                  </div>
                    <p className="mt-0.5 text-[12.5px] text-[#6b6b6b]">{r.kind === 'parental' && r.parental_subtype ? `${parentalSubtypeLabel(r.parental_subtype)} · ` : ''}{fmtDate(r.start_date)} – {fmtDate(r.end_date)} &middot; {r.half_day_portion ? `Half day (${r.half_day_portion.toUpperCase()})` : daysLabel(r.start_date, r.end_date)}</p>
                  {r.note ? <p className="mt-0.5 text-[12px] italic text-[#9b9b9b]">&ldquo;{r.note}&rdquo;</p> : null}
                  {documentsByRequestId[r.id]?.length ? (
                    <div className="mt-1 flex flex-wrap gap-2">
                      {documentsByRequestId[r.id].map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => void openSupportingDocument(d)}
                          className="rounded-lg border border-[#d8d8d8] bg-white px-2 py-1 text-[11px] text-[#6b6b6b] hover:bg-[#f5f4f1]"
                        >
                          {supportingDocKindLabel(d.document_kind)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {(r.status === 'approved' || r.status === 'rejected') && r.decision_note ? (
                    <p className="mt-1 text-[12px] text-[#6b6b6b]">
                      <span className="font-medium text-[#121212]">Approver note: </span>
                      {r.decision_note}
                    </p>
                  ) : null}
                  {r.status === 'pending_edit' && r.proposed_start_date && r.proposed_end_date ? (
                    <p className="mt-1 text-[12px] text-[#92400e]">
                      Edit requested: {leaveKindLabel(r.proposed_kind ?? r.kind)}{(r.proposed_kind ?? r.kind) === 'parental' && r.proposed_parental_subtype ? ` (${parentalSubtypeLabel(r.proposed_parental_subtype)})` : ''} &middot; {fmtDate(r.proposed_start_date)} – {fmtDate(r.proposed_end_date)}
                      {r.proposed_half_day_portion ? ` · Half day (${r.proposed_half_day_portion.toUpperCase()})` : ''}
                    </p>
                  ) : null}
                  {r.status === 'pending_cancel' ? (
                    <p className="mt-1.5 text-[12px] leading-relaxed text-[#6b6b6b]">
                      Cancellation requested for this approved leave.
                    </p>
                  ) : null}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  {r.status === 'pending' ? (
                    <button type="button" disabled={busy} onClick={() => void cancelRequest(r.id)} className="text-[12px] text-[#b91c1c] underline underline-offset-2 disabled:opacity-50 hover:no-underline">
                      Cancel
                    </button>
                  ) : null}
                  {isWithinApprovedChangeWindow(r, approvedChangeWindowHours) ? (
                    <>
                      <button type="button" disabled={busy} onClick={() => openEditDialog(r)} className="text-[12px] text-[#6b6b6b] underline underline-offset-2 disabled:opacity-50 hover:no-underline">
                        Request edit
                      </button>
                      <button type="button" disabled={busy} onClick={() => void requestCancelApproval(r.id)} className="text-[12px] text-[#b91c1c] underline underline-offset-2 disabled:opacity-50 hover:no-underline">
                        Request cancellation
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {canSubmit && myToilCreditRequests.length > 0 ? (
        <section>
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">My overtime (TOIL) requests</h2>
          <div className="overflow-hidden rounded-2xl border border-[#e8e8e8] bg-white">
            {myToilCreditRequests.map((t, i) => (
              <div key={t.id} className={`flex flex-col gap-1.5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${i > 0 ? 'border-t border-[#f0f0f0]' : ''}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-medium text-[#121212]">Overtime credit</span>
                    <StatusPill status={t.status} />
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-[#6b6b6b]">
                    {fmtDate(t.work_date)} &middot; {formatToilMinutes(t.minutes_earned, toilMinutesPerDay)}
                  </p>
                  {t.note ? <p className="mt-0.5 text-[12px] italic text-[#9b9b9b]">&ldquo;{t.note}&rdquo;</p> : null}
                  {(t.status === 'approved' || t.status === 'rejected') && t.decision_note ? (
                    <p className="mt-1 text-[12px] text-[#6b6b6b]">
                      <span className="font-medium text-[#121212]">Approver note: </span>
                      {t.decision_note}
                    </p>
                  ) : null}
                </div>
                {t.status === 'pending' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void cancelToilCreditRequest(t.id)}
                    className="shrink-0 text-[12px] text-[#b91c1c] underline underline-offset-2 disabled:opacity-50 hover:no-underline"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {canSubmit && myCarryoverRequests.length > 0 ? (
        <section>
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">My carry-over requests</h2>
          <div className="overflow-hidden rounded-2xl border border-[#e8e8e8] bg-white">
            {myCarryoverRequests.map((c, i) => (
              <div key={c.id} className={`flex flex-col gap-1.5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${i > 0 ? 'border-t border-[#f0f0f0]' : ''}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-medium text-[#121212]">Carry-over</span>
                    <StatusPill status={c.status} />
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-[#6b6b6b]">
                    {c.days_requested} day{c.days_requested === 1 ? '' : 's'} from {c.from_leave_year} to {c.to_leave_year}
                    {c.status === 'approved' && c.days_approved != null ? ` · ${c.days_approved} approved` : ''}
                  </p>
                  {c.note ? <p className="mt-0.5 text-[12px] italic text-[#9b9b9b]">&ldquo;{c.note}&rdquo;</p> : null}
                  {(c.status === 'approved' || c.status === 'rejected') && c.decision_note ? (
                    <p className="mt-1 text-[12px] text-[#6b6b6b]">
                      <span className="font-medium text-[#121212]">Approver note: </span>
                      {c.decision_note}
                    </p>
                  ) : null}
                </div>
                {c.status === 'pending' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void cancelCarryoverRequest(c.id)}
                    className="shrink-0 text-[12px] text-[#b91c1c] underline underline-offset-2 disabled:opacity-50 hover:no-underline"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {canSubmit && myEncashmentRequests.length > 0 ? (
        <section>
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">My encashment requests</h2>
          <div className="overflow-hidden rounded-2xl border border-[#e8e8e8] bg-white">
            {myEncashmentRequests.map((e, i) => (
              <div key={e.id} className={`flex flex-col gap-1.5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${i > 0 ? 'border-t border-[#f0f0f0]' : ''}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-medium text-[#121212]">Encashment</span>
                    <StatusPill status={e.status} />
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-[#6b6b6b]">
                    {e.days_requested} day{e.days_requested === 1 ? '' : 's'} from leave year {e.leave_year}
                    {e.status === 'approved' && e.days_approved != null ? ` · ${e.days_approved} approved` : ''}
                  </p>
                  {e.note ? <p className="mt-0.5 text-[12px] italic text-[#9b9b9b]">&ldquo;{e.note}&rdquo;</p> : null}
                  {(e.status === 'approved' || e.status === 'rejected') && e.decision_note ? (
                    <p className="mt-1 text-[12px] text-[#6b6b6b]">
                      <span className="font-medium text-[#121212]">Approver note: </span>
                      {e.decision_note}
                    </p>
                  ) : null}
                </div>
                {e.status === 'pending' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void cancelEncashmentRequest(e.id)}
                    className="shrink-0 text-[12px] text-[#b91c1c] underline underline-offset-2 disabled:opacity-50 hover:no-underline"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* SSP estimate (UK) — shown when “Details” is on */}
      {leaveExplainerOpen && canSubmit && sspSummary ? (
        <section>
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">
            Statutory Sick Pay (estimate)
          </h2>
          <div className="overflow-hidden rounded-2xl border border-[#e8e8e8] bg-white px-5 py-4 text-[13px] text-[#6b6b6b]">
            <p className="text-[12px] text-[#9b9b9b]">
              Indicative SSP from sickness episodes in the last two years (HMRC-style PIW linking). Not payroll advice.
            </p>
            <dl className="mt-3 grid gap-2 sm:grid-cols-2">
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-[#9b9b9b]">Scheme</dt>
                <dd className="text-[#121212]">{String(sspSummary.scheme ?? '—')}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-[#9b9b9b]">Total SSP (£)</dt>
                <dd className="text-[18px] font-semibold text-[#121212]">
                  £{Number(sspSummary.total_ssp_gbp ?? 0).toFixed(2)}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-[#9b9b9b]">Weekly rate used (£)</dt>
                <dd>{Number(sspSummary.ssp_weekly_payable_gbp ?? 0).toFixed(2)}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-[#9b9b9b]">Daily rate (£)</dt>
                <dd>{Number(sspSummary.ssp_daily_rate_gbp ?? 0).toFixed(4)}</dd>
              </div>
            </dl>
            {sspSummary.ineligible_below_lel ? (
              <p className="mt-3 text-[12px] text-[#b45309]">
                Below Lower Earnings Limit — SSP not payable under legacy LEL rules. Clear LEL in leave settings for 2026 reform.
              </p>
            ) : null}
            {Array.isArray(sspSummary.notes) && (sspSummary.notes as unknown[]).length > 0 ? (
              <ul className="mt-2 list-inside list-disc text-[12px] text-[#9b9b9b]">
                {(sspSummary.notes as string[]).map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* Sickness history */}
      {canSubmit && sickness.length > 0 ? (
        <section>
          <button type="button" onClick={() => setShowSickHistory((v) => !v)} className="mb-3 flex w-full items-center justify-between text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b] hover:text-[#6b6b6b]">
            <span>Sick day history</span>
            <span>{showSickHistory ? '▲' : '▼'}</span>
          </button>
          {showSickHistory ? (
            <div className="overflow-hidden rounded-2xl border border-[#e8e8e8] bg-white">
              {sickness.map((s, i) => (
                <div key={s.id} className={`px-5 py-3 text-[12.5px] text-[#6b6b6b] ${i > 0 ? 'border-t border-[#f0f0f0]' : ''}`}>
                  {fmtDate(s.start_date)} – {fmtDate(s.end_date)} &middot; {s.half_day_portion ? `Half day (${s.half_day_portion.toUpperCase()})` : daysLabel(s.start_date, s.end_date)}
                  {s.notes ? <span className="ml-2 italic text-[#9b9b9b]">&ldquo;{s.notes}&rdquo;</span> : null}
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Absence score — full card hidden unless “Details” is on */}
      {leaveExplainerOpen && absenceScore ? (
        <section>
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Absence score</h2>
          <div className="overflow-hidden rounded-2xl border border-[#e8e8e8] bg-white">
            <div className="grid divide-y divide-[#f0f0f0] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {[
                { label: 'Separate absences', value: absenceScore.spell_count },
                { label: 'Total sick days', value: absenceScore.total_days },
                { label: 'Absence score', value: absenceScore.bradford_score, highlight: absenceScore.bradford_score >= 200 },
              ].map((stat) => (
                <div key={stat.label} className={`p-5 ${stat.highlight ? 'bg-[#fef2f2]' : ''}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">{stat.label}</p>
                  <p className={`mt-1.5 text-[32px] font-bold leading-none tracking-tight ${stat.highlight ? 'text-[#b91c1c]' : 'text-[#121212]'}`}>{stat.value}</p>
                </div>
              ))}
            </div>
            {absenceScore.bradford_score >= 200 ? (
              <div className="border-t border-[#fecaca] bg-[#fef2f2] px-5 py-3">
                <p className="text-[12.5px] text-[#b91c1c]">Your score is above the review threshold. Your HR team may be in touch.</p>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
        </aside>
      </div>

      {approvalModal ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="leave-approval-modal-title"
          onClick={() => {
            if (!busy) {
              setApprovalModal(null);
              setApprovalNote('');
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[#e8e8e8] bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="leave-approval-modal-title" className="mb-1 text-[15px] font-semibold text-[#121212]">
              {approvalModal.source === 'toil_credit'
                ? approvalModal.approve
                  ? 'Approve TOIL credit'
                  : 'Decline TOIL credit'
                : approvalModal.source === 'carryover'
                  ? approvalModal.approve
                    ? 'Approve carry-over request'
                    : 'Decline carry-over request'
                  : approvalModal.source === 'encashment'
                    ? approvalModal.approve
                      ? 'Approve encashment request'
                      : 'Decline encashment request'
                  : approvalModal.approve
                    ? 'Approve leave request'
                    : 'Decline leave request'}
            </h2>
            <p className="mb-4 text-[12px] text-[#9b9b9b]">
              Optional note for the employee (shown when the decision is saved).
            </p>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-[#6b6b6b]">Note (optional)</span>
              <textarea
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
                rows={3}
                className="w-full resize-y rounded-xl border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13px] focus:border-[#121212] focus:outline-none"
                placeholder="e.g. approved — enjoy your break"
              />
            </label>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void submitApprovalDecision()}
                className={`inline-flex h-10 items-center rounded-xl px-5 text-[13px] font-medium text-white disabled:opacity-50 ${approvalModal.approve ? 'bg-[var(--org-brand-primary,#121212)] hover:bg-[color-mix(in_oklab,var(--org-brand-primary,#121212)_88%,black)]' : 'bg-[#b91c1c] hover:bg-[#991b1b]'}`}
              >
                {busy ? 'Saving…' : approvalModal.approve ? 'Approve' : 'Decline'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setApprovalModal(null);
                  setApprovalNote('');
                }}
                className="inline-flex h-10 items-center rounded-xl border border-[#d8d8d8] bg-white px-5 text-[13px] font-medium text-[#6b6b6b]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
