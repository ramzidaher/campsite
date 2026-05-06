import DateTimePicker from '@react-native-community/datetimepicker';
import { useCampsiteTheme } from '@campsite/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { ProfileRow } from '@/lib/AuthContext';
import {
  currentLeaveYearKey,
  dbLeaveYearKeyFromUiKey,
  formatLeaveYearPeriodRange,
  leaveYearUiKeyFromDbKey,
} from '@/lib/datetime';
import { leaveRangeOverlapsExisting } from '@/lib/leaveDateOverlap';
import { getSupabase } from '@/lib/supabase';
import { formatToilMinutes, toilInputToMinutes } from '@/lib/toilDuration';
import {
  countOrgLeaveDaysInclusive,
  overlapInclusiveRange,
  type OrgLeaveDayOptions,
} from '@/lib/workingDays';

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
  proposed_start_date?: string | null;
  proposed_end_date?: string | null;
  proposed_half_day_portion?: 'am' | 'pm' | null;
  requester_id?: string;
  requester_name?: string;
};

type AllowanceRow = {
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
  requester_name?: string;
};

type HolidayPeriod = {
  id: string;
  name: string;
  holiday_kind: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
};

function daysBetween(start: string, end: string): number {
  const a = new Date(`${start}T12:00:00Z`);
  const b = new Date(`${end}T12:00:00Z`);
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

/** Annual leave that still reserves entitlement until rejected/cancelled/declined. */
function annualCountsTowardUsage(status: string): boolean {
  return (
    status === 'approved' ||
    status === 'pending' ||
    status === 'pending_edit' ||
    status === 'pending_cancel'
  );
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function statusLabel(s: string): { text: string; color: string } {
  switch (s) {
    case 'approved':
      return { text: 'Approved', color: '#166534' };
    case 'rejected':
      return { text: 'Declined', color: '#b91c1c' };
    case 'cancelled':
      return { text: 'Cancelled', color: '#9b9b9b' };
    default:
      return { text: 'Awaiting approval', color: '#c2410c' };
  }
}

function kindLabel(k: string): string {
  switch (k) {
    case 'annual': return 'Annual leave';
    case 'toil': return 'Time off in lieu (TOIL)';
    case 'parental': return 'Parental leave';
    case 'bereavement': return 'Bereavement leave';
    case 'compassionate': return 'Compassionate leave';
    case 'study': return 'Study leave';
    case 'unpaid': return 'Unpaid leave';
    default: return k;
  }
}

function parentalSubtypeLabel(v: string | null | undefined): string {
  switch (v) {
    case 'maternity': return 'Maternity';
    case 'paternity': return 'Paternity';
    case 'adoption': return 'Adoption';
    case 'shared_parental': return 'Shared parental';
    default: return '';
  }
}

export function LeaveScreen({ profile }: { profile: ProfileRow }) {
  const { tokens, scheme } = useCampsiteTheme();
  const isDark = scheme === 'dark';
  const supabase = useMemo(() => getSupabase(), []);

  const [allowance, setAllowance] = useState<AllowanceRow | null>(null);
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [myToilCredits, setMyToilCredits] = useState<ToilCreditRequest[]>([]);
  const [pendingForMe, setPendingForMe] = useState<LeaveRequest[]>([]);
  const [pendingToilForMe, setPendingToilForMe] = useState<ToilCreditRequest[]>([]);
  const [toilMinutesPerDay, setToilMinutesPerDay] = useState(480);
  const [canSubmit, setCanSubmit] = useState(false);
  const [canApprove, setCanApprove] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  // Form state
  const [formKind, setFormKind] = useState<'annual' | 'toil' | 'parental' | 'bereavement' | 'compassionate' | 'study' | 'unpaid'>('annual');
  const [formStart, setFormStart] = useState(new Date());
  const [formEnd, setFormEnd] = useState(new Date());
  const [formNote, setFormNote] = useState('');
  const [formDayMode, setFormDayMode] = useState<'full' | 'half'>('full');
  const [formHalfDayPortion, setFormHalfDayPortion] = useState<'am' | 'pm'>('am');
  const [formParentalSubtype, setFormParentalSubtype] = useState<'maternity' | 'paternity' | 'adoption' | 'shared_parental'>('maternity');
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showToilEarnForm, setShowToilEarnForm] = useState(false);
  const [section, setSection] = useState<'mine' | 'approve'>('mine');
  const [approvalModal, setApprovalModal] = useState<
    null | { source: 'leave' | 'toil_credit'; id: string; approve: boolean; name: string }
  >(null);
  const [approvalNote, setApprovalNote] = useState('');
  const [toilEarnWorkDate, setToilEarnWorkDate] = useState(new Date());
  const [toilEarnAmount, setToilEarnAmount] = useState('');
  const [toilEarnUnit, setToilEarnUnit] = useState<'minutes' | 'hours' | 'days'>('hours');
  const [toilEarnNote, setToilEarnNote] = useState('');
  const [showToilWorkPicker, setShowToilWorkPicker] = useState(false);

  /** User-chosen leave year key; null = follow org leave year for “today”. */
  const [yearOverride, setYearOverride] = useState<string | null>(null);
  const [leaveYearStartMonth, setLeaveYearStartMonth] = useState(1);
  const [leaveYearStartDay, setLeaveYearStartDay] = useState(1);
  const [leaveUseWorkingDays, setLeaveUseWorkingDays] = useState(false);
  const [nonWorkingIsoDows, setNonWorkingIsoDows] = useState<number[]>([6, 7]);
  const [absenceScore, setAbsenceScore] = useState<{
    spell_count: number;
    total_days: number;
    bradford_score: number;
  } | null>(null);
  const [holidayPeriods, setHolidayPeriods] = useState<HolidayPeriod[]>([]);

  const orgId = profile.org_id ?? '';
  const userId = profile.id;

  const defaultLeaveYearKey = currentLeaveYearKey(new Date(), leaveYearStartMonth, leaveYearStartDay);
  const year = yearOverride ?? defaultLeaveYearKey;

  const leaveYearUiYearOptions = useMemo(() => {
    const cy = new Date().getFullYear();
    const uiSet = new Set([cy - 1, cy, cy + 1]);
    const uiSelected = Number(leaveYearUiKeyFromDbKey(year, leaveYearStartMonth, leaveYearStartDay));
    if (Number.isFinite(uiSelected)) uiSet.add(uiSelected);
    return [...uiSet].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  }, [year, leaveYearStartMonth, leaveYearStartDay]);

  const leavePeriodLabel = useMemo(
    () => formatLeaveYearPeriodRange(year, leaveYearStartMonth, leaveYearStartDay),
    [year, leaveYearStartMonth, leaveYearStartDay],
  );

  const load = useCallback(async () => {
    if (!orgId) return;
    const { data: os } = await supabase
      .from('org_leave_settings')
      .select(
        'leave_year_start_month, leave_year_start_day, leave_use_working_days, non_working_iso_dows, toil_minutes_per_day',
      )
      .eq('org_id', orgId)
      .maybeSingle();

    const sm = Number(os?.leave_year_start_month ?? 1);
    const sd = Number(os?.leave_year_start_day ?? 1);
    setLeaveYearStartMonth(sm);
    setLeaveYearStartDay(sd);
    setLeaveUseWorkingDays(Boolean(os?.leave_use_working_days));
    const dows = Array.isArray(os?.non_working_iso_dows)
      ? (os.non_working_iso_dows as number[]).map((n) => Number(n))
      : [6, 7];
    setNonWorkingIsoDows(dows.length ? dows : [6, 7]);
    setToilMinutesPerDay(Math.max(1, Number(os?.toil_minutes_per_day ?? 480)));

    const naturalYear = currentLeaveYearKey(new Date(), sm, sd);
    const activeYear = yearOverride ?? naturalYear;

    const todayIso = new Date().toISOString().slice(0, 10);

    const [
      { data: permsData },
      { data: al },
      { data: mine },
      { data: mineToil },
      bfRes,
      { data: holidays },
    ] = await Promise.all([
      supabase.rpc('get_my_permissions', { p_org_id: orgId }),
      supabase
        .from('leave_allowances')
        .select('annual_entitlement_days, toil_balance_days')
        .eq('org_id', orgId)
        .eq('user_id', userId)
        .eq('leave_year', activeYear)
        .maybeSingle(),
      supabase
        .from('leave_requests')
        .select('id, kind, start_date, end_date, half_day_portion, parental_subtype, status, note, decision_note, created_at, proposed_start_date, proposed_end_date, proposed_half_day_portion')
        .eq('org_id', orgId)
        .eq('requester_id', userId)
        .order('created_at', { ascending: false })
        .limit(80),
      supabase
        .from('toil_credit_requests')
        .select('id, work_date, minutes_earned, note, status, decision_note, created_at')
        .eq('org_id', orgId)
        .eq('requester_id', userId)
        .order('created_at', { ascending: false })
        .limit(40),
      supabase.rpc('bradford_factor_for_user', { p_user_id: userId, p_on: todayIso }),
      supabase
        .from('org_leave_holiday_periods')
        .select('id, name, holiday_kind, start_date, end_date, is_active')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .order('start_date', { ascending: true }),
    ]);

    if (!bfRes.error && bfRes.data != null) {
      const raw = bfRes.data as unknown;
      const b0 = Array.isArray(raw) ? raw[0] : raw;
      if (b0 && typeof b0 === 'object' && 'spell_count' in b0) {
        const o = b0 as { spell_count: number; total_days: number; bradford_score: number };
        setAbsenceScore({
          spell_count: Number(o.spell_count),
          total_days: Number(o.total_days),
          bradford_score: Number(o.bradford_score),
        });
      } else {
        setAbsenceScore(null);
      }
    } else {
      setAbsenceScore(null);
    }

    const keys = ((permsData ?? []) as Array<{ permission_key?: string }>).map((p) =>
      String(p.permission_key ?? ''),
    );
    const submit = keys.includes('leave.submit');
    const approve =
      keys.includes('leave.approve_direct_reports') || keys.includes('leave.manage_org');
    setCanSubmit(submit);
    setCanApprove(approve);

    setAllowance(
      al
        ? {
            annual_entitlement_days: Number(al.annual_entitlement_days ?? 0),
            toil_balance_days: Number(al.toil_balance_days ?? 0),
          }
        : { annual_entitlement_days: 0, toil_balance_days: 0 },
    );
    setMyRequests((mine ?? []) as LeaveRequest[]);
    setMyToilCredits((mineToil ?? []) as ToilCreditRequest[]);
    setHolidayPeriods((holidays ?? []) as HolidayPeriod[]);

    if (approve) {
      const isManager = keys.includes('leave.manage_org');
      let pend: LeaveRequest[] = [];
      let pendToil: ToilCreditRequest[] = [];
      if (isManager) {
        const { data } = await supabase
          .from('leave_requests')
          .select('id, requester_id, kind, start_date, end_date, half_day_portion, parental_subtype, status, note, created_at')
          .eq('org_id', orgId)
          .in('status', ['pending', 'pending_cancel', 'pending_edit'])
          .order('created_at', { ascending: false });
        pend = (data ?? []) as LeaveRequest[];
        const { data: toilData } = await supabase
          .from('toil_credit_requests')
          .select('id, requester_id, work_date, minutes_earned, note, status, created_at')
          .eq('org_id', orgId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false });
        pendToil = (toilData ?? []) as ToilCreditRequest[];
      } else {
        const { data: reps } = await supabase
          .from('profiles')
          .select('id')
          .eq('org_id', orgId)
          .eq('reports_to_user_id', userId);
        const ids = (reps ?? []).map((r) => r.id as string).filter(Boolean);
        if (ids.length) {
          const { data } = await supabase
            .from('leave_requests')
            .select('id, requester_id, kind, start_date, end_date, half_day_portion, parental_subtype, status, note, created_at')
            .eq('org_id', orgId)
            .in('status', ['pending', 'pending_cancel', 'pending_edit'])
            .in('requester_id', ids)
            .order('created_at', { ascending: false });
          pend = (data ?? []) as LeaveRequest[];
          const { data: toilData } = await supabase
            .from('toil_credit_requests')
            .select('id, requester_id, work_date, minutes_earned, note, status, created_at')
            .eq('org_id', orgId)
            .eq('status', 'pending')
            .in('requester_id', ids)
            .order('created_at', { ascending: false });
          pendToil = (toilData ?? []) as ToilCreditRequest[];
        }
      }
      const nameIds = [
        ...new Set([
          ...pend.map((r) => r.requester_id as string),
          ...pendToil.map((t) => t.requester_id as string),
        ]),
      ];
      const nameMap: Record<string, string> = {};
      if (nameIds.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', nameIds);
        for (const p of profs ?? []) nameMap[p.id as string] = (p.full_name as string) ?? '';
      }
      setPendingForMe(pend.map((r) => ({ ...r, requester_name: nameMap[r.requester_id as string] ?? 'Team member' })));
      setPendingToilForMe(
        pendToil.map((t) => ({ ...t, requester_name: nameMap[t.requester_id as string] ?? 'Team member' })),
      );
    } else {
      setPendingForMe([]);
      setPendingToilForMe([]);
    }
  }, [supabase, orgId, userId, yearOverride]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

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

  const entitlement = allowance?.annual_entitlement_days ?? 0;
  const remaining = Math.max(0, entitlement - usedAnnual);
  const toilBalance = allowance?.toil_balance_days ?? 0;

  const formStartIso = toIsoDate(formStart);
  const formEndIso = toIsoDate(formEnd);

  const requestedDaysInLeaveYear = useMemo(() => {
    if (!formStartIso || !formEndIso || formEndIso < formStartIso) return 0;
    const seg = overlapInclusiveRange(formStartIso, formEndIso, leaveYearStartIso, leaveYearEndIso);
    if (!seg) return 0;
    return countOrgLeaveDaysInclusive(seg.start, seg.end, leaveDayOpts);
  }, [formStartIso, formEndIso, leaveYearStartIso, leaveYearEndIso, leaveDayOpts]);

  const formTripDays =
    formStartIso && formEndIso && formEndIso >= formStartIso ? daysBetween(formStartIso, formEndIso) : 0;

  const calendarDaysInLeaveYearForForm = useMemo(() => {
    if (!formStartIso || !formEndIso || formEndIso < formStartIso) return 0;
    const seg = overlapInclusiveRange(formStartIso, formEndIso, leaveYearStartIso, leaveYearEndIso);
    if (!seg) return 0;
    return daysBetween(seg.start, seg.end);
  }, [formStartIso, formEndIso, leaveYearStartIso, leaveYearEndIso]);

  const projectedAnnualRemaining =
    formKind === 'annual' ? remaining - requestedDaysInLeaveYear : remaining;
  const exceedsAnnualAllowance =
    formKind === 'annual' && requestedDaysInLeaveYear > 0 && projectedAnnualRemaining < 0;

  const newLeaveOverlaps = useMemo(
    () =>
      Boolean(
        formStartIso &&
          formEndIso &&
          formEndIso >= formStartIso &&
          leaveRangeOverlapsExisting(myRequests, formStartIso, formEndIso),
      ),
    [myRequests, formStartIso, formEndIso],
  );

  const bookingPreviewText = useMemo(() => {
    if (!formStartIso || !formEndIso || formEndIso < formStartIso) return '';
    const parts: string[] = [];
    parts.push(`${formTripDays} calendar day${formTripDays === 1 ? '' : 's'} in range`);
    if (formKind === 'annual' && leaveUseWorkingDays) {
      if (requestedDaysInLeaveYear > 0) {
        parts.push(
          `${requestedDaysInLeaveYear} working leave day${requestedDaysInLeaveYear === 1 ? '' : 's'} in year ${year}`,
        );
      } else {
        parts.push(`no working leave days in year ${year} for this range`);
      }
    }
    if (formKind === 'annual' && !leaveUseWorkingDays && formTripDays !== calendarDaysInLeaveYearForForm) {
      if (calendarDaysInLeaveYearForForm > 0) {
        parts.push(
          `${calendarDaysInLeaveYearForForm} calendar day${calendarDaysInLeaveYearForForm === 1 ? '' : 's'} in leave year ${year}`,
        );
      } else {
        parts.push(`none of these days fall in leave year ${year}`);
      }
    }
    if (formKind === 'toil' && leaveUseWorkingDays) {
      parts.push(
        `${requestedDaysInLeaveYear} working day${requestedDaysInLeaveYear === 1 ? '' : 's'} in year ${year} toward TOIL`,
      );
    }
    if (formKind === 'annual') {
      parts.push(
        `${Math.max(0, projectedAnnualRemaining)} day${Math.max(0, projectedAnnualRemaining) === 1 ? '' : 's'} remaining after this`,
      );
    } else if (formKind === 'toil') {
      parts.push(`${toilBalance} TOIL day${toilBalance === 1 ? '' : 's'} available`);
    } else {
      parts.push('submitted for manager approval');
    }
    if (newLeaveOverlaps) parts.push('overlaps another booking');
    if (exceedsAnnualAllowance) {
      parts.push(
        `exceeds allowance by ${Math.abs(projectedAnnualRemaining)} day${Math.abs(projectedAnnualRemaining) === 1 ? '' : 's'}`,
      );
    }
    return parts.join(' · ');
  }, [
    formStartIso,
    formEndIso,
    formTripDays,
    formKind,
    leaveUseWorkingDays,
    requestedDaysInLeaveYear,
    year,
    calendarDaysInLeaveYearForForm,
    projectedAnnualRemaining,
    toilBalance,
    newLeaveOverlaps,
    exceedsAnnualAllowance,
  ]);

  async function submitLeave() {
    const start = toIsoDate(formStart);
    const end = toIsoDate(formEnd);
    if (end < start) {
      Alert.alert('Invalid dates', 'End date must be on or after start date.');
      return;
    }
    if (leaveRangeOverlapsExisting(myRequests, start, end)) {
      Alert.alert(
        'Overlapping dates',
        'Those dates overlap another leave booking. Change the range or cancel the other request first.',
      );
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('leave_request_submit', {
      p_kind: formKind,
      p_start: start,
      p_end: formDayMode === 'half' ? start : end,
      p_note: formNote.trim() || null,
      p_half_day_portion: formDayMode === 'half' ? formHalfDayPortion : null,
      p_parental_subtype: formKind === 'parental' ? formParentalSubtype : null,
    });
    setBusy(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setFormNote('');
    setFormDayMode('full');
    setFormHalfDayPortion('am');
    setFormParentalSubtype('maternity');
    setShowForm(false);
    await load();
    Alert.alert('Submitted', 'Your leave request has been submitted for approval.');
  }

  async function cancelRequest(id: string) {
    Alert.alert('Cancel request?', 'This will withdraw your leave request.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel request',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          const { error } = await supabase.rpc('leave_request_cancel', { p_request_id: id });
          setBusy(false);
          if (error) Alert.alert('Error', error.message);
          else await load();
        },
      },
    ]);
  }

  function openApprovalDialog(source: 'leave' | 'toil_credit', id: string, approve: boolean, name: string) {
    setApprovalModal({ source, id, approve, name });
    setApprovalNote('');
  }

  async function submitToilEarn() {
    const amt = Number(toilEarnAmount);
    const minutes = toilInputToMinutes(amt, toilEarnUnit, toilMinutesPerDay);
    if (minutes < 1) {
      Alert.alert('Invalid amount', 'Enter a positive amount of overtime.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('toil_credit_request_submit', {
      p_work_date: toIsoDate(toilEarnWorkDate),
      p_minutes: minutes,
      p_note: toilEarnNote.trim() || null,
    });
    setBusy(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setToilEarnAmount('');
    setToilEarnNote('');
    setShowToilEarnForm(false);
    await load();
    Alert.alert('Submitted', 'Your TOIL credit request was sent for manager approval.');
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
        : await supabase.rpc('toil_credit_request_decide', {
            p_request_id: approvalModal.id,
            p_approve: approvalModal.approve,
            p_note: note,
          });
    setBusy(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setApprovalModal(null);
    setApprovalNote('');
    await load();
  }

  const mergedApprovalQueue = useMemo(() => {
    type Row =
      | { key: string; created_at: string; kind: 'leave'; leave: LeaveRequest & { requester_name?: string } }
      | { key: string; created_at: string; kind: 'toil'; toil: ToilCreditRequest };
    const rows: Row[] = [
      ...pendingForMe.map((leave) => ({
        key: `l-${leave.id}`,
        created_at: leave.created_at,
        kind: 'leave' as const,
        leave,
      })),
      ...pendingToilForMe.map((toil) => ({
        key: `t-${toil.id}`,
        created_at: toil.created_at,
        kind: 'toil' as const,
        toil,
      })),
    ];
    rows.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
    return rows;
  }, [pendingForMe, pendingToilForMe]);

  const bg = isDark ? tokens.background : '#faf9f6';
  const cardBg = isDark ? tokens.surface : '#ffffff';
  const border = isDark ? tokens.border : '#e8e8e8';
  const textPrimary = isDark ? tokens.textPrimary : '#121212';
  const textSecondary = isDark ? tokens.textSecondary : '#6b6b6b';

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: bg }}>
        <ActivityIndicator color={textSecondary} />
      </View>
    );
  }

  return (
    <>
    <ScrollView
        style={{ flex: 1, backgroundColor: bg }}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: textPrimary }]}>Time off</Text>
          <Text style={[styles.subtitle, { color: textSecondary }]}>
            Balances and usage for leave year {leaveYearUiKeyFromDbKey(year, leaveYearStartMonth, leaveYearStartDay)}
            {yearOverride == null ? ' (org default for today)' : ''}.
          </Text>
        </View>

        <View style={{ marginBottom: 14 }}>
          <Text style={[styles.fieldLabel, { color: textSecondary, marginBottom: 8 }]}>Leave year</Text>
          <Text style={{ fontSize: 11, lineHeight: 15, color: textSecondary, marginBottom: 8 }}>{leavePeriodLabel}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Pressable
              onPress={() => setYearOverride(null)}
              style={[
                styles.yearChip,
                { borderColor: border, backgroundColor: yearOverride === null ? '#121212' : cardBg },
              ]}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: yearOverride === null ? '#fff' : textPrimary,
                }}
              >
                Default
              </Text>
            </Pressable>
            {leaveYearUiYearOptions.map((uiY) => {
              const dbY = dbLeaveYearKeyFromUiKey(uiY, leaveYearStartMonth, leaveYearStartDay);
              return (
                <Pressable
                  key={dbY}
                  onPress={() => setYearOverride(dbY)}
                  style={[
                    styles.yearChip,
                    {
                      borderColor: border,
                      backgroundColor: year === dbY && yearOverride !== null ? '#121212' : cardBg,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: year === dbY && yearOverride !== null ? '#fff' : textPrimary,
                    }}
                  >
                    {uiY}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Balance cards */}
        <View style={styles.balanceRow}>
          <View style={[styles.balanceCard, { backgroundColor: cardBg, borderColor: border }]}>
            <Text style={[styles.balanceNum, { color: textPrimary }]}>{entitlement}</Text>
            <Text style={[styles.balanceLabel, { color: textSecondary }]}>Days entitlement</Text>
          </View>
          <View style={[styles.balanceCard, { backgroundColor: cardBg, borderColor: border }]}>
            <Text style={[styles.balanceNum, { color: textPrimary }]}>{usedAnnual}</Text>
            <Text style={[styles.balanceLabel, { color: textSecondary }]}>
              Days used{leaveUseWorkingDays ? ' (working)' : ''}
            </Text>
          </View>
          <View style={[styles.balanceCard, { backgroundColor: '#f0fdf9', borderColor: '#bbf7d0' }]}>
            <Text style={[styles.balanceNum, { color: '#166534' }]}>{remaining}</Text>
            <Text style={[styles.balanceLabel, { color: '#166534' }]}>Days remaining</Text>
          </View>
        </View>
        <View style={[styles.toilBanner, { backgroundColor: cardBg, borderColor: border }]}>
          <Text style={[styles.toilText, { color: textSecondary }]}>
            TOIL balance: <Text style={{ fontWeight: '600', color: textPrimary }}>{toilBalance} days</Text>
            {' · '}
            {toilMinutesPerDay} min = 1 day
          </Text>
          {canSubmit ? (
            <Pressable
              style={[styles.toilAddBtn, { borderColor: '#008B60', marginTop: 10 }]}
              onPress={() => {
                setShowToilEarnForm((v) => !v);
                setShowForm(false);
              }}
            >
              <Text style={styles.toilAddBtnText}>{showToilEarnForm ? 'Close' : '+ Add TOIL (overtime)'}</Text>
            </Pressable>
          ) : null}
        </View>

        {absenceScore ? (
          <View
            style={[
              styles.card,
              {
                backgroundColor: cardBg,
                borderColor: border,
                marginBottom: 16,
              },
            ]}
          >
            <Text style={[styles.cardTitle, { color: textPrimary }]}>Absence score</Text>
            <Text style={{ fontSize: 12, color: textSecondary, marginBottom: 10 }}>
              Based on sickness and leave episodes (Bradford-style S² × D) in the rolling policy window.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              <View style={{ minWidth: '28%' }}>
                <Text style={{ fontSize: 11, color: textSecondary, textTransform: 'uppercase' }}>Spells</Text>
                <Text style={{ fontSize: 22, fontWeight: '700', color: textPrimary }}>{absenceScore.spell_count}</Text>
              </View>
              <View style={{ minWidth: '28%' }}>
                <Text style={{ fontSize: 11, color: textSecondary, textTransform: 'uppercase' }}>Sick days</Text>
                <Text style={{ fontSize: 22, fontWeight: '700', color: textPrimary }}>{absenceScore.total_days}</Text>
              </View>
              <View style={{ minWidth: '28%' }}>
                <Text style={{ fontSize: 11, color: textSecondary, textTransform: 'uppercase' }}>Score</Text>
                <Text
                  style={{
                    fontSize: 22,
                    fontWeight: '700',
                    color: absenceScore.bradford_score >= 200 ? '#b91c1c' : textPrimary,
                  }}
                >
                  {absenceScore.bradford_score}
                </Text>
              </View>
            </View>
            {absenceScore.bradford_score >= 200 ? (
              <Text style={{ marginTop: 10, fontSize: 13, color: '#b91c1c' }}>
                Above the usual review threshold  HR may follow up.
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Section tabs */}
        {canApprove ? (
          <View style={[styles.segmentRow, { backgroundColor: isDark ? tokens.surface : '#f0eeea' }]}>
            {(['mine', 'approve'] as const).map((s) => (
              <Pressable
                key={s}
                style={[styles.segment, section === s && { backgroundColor: cardBg, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 }]}
                onPress={() => setSection(s)}
              >
                <Text style={[styles.segmentLabel, { color: section === s ? textPrimary : textSecondary, fontWeight: section === s ? '600' : '400' }]}>
                  {s === 'mine' ? 'My requests' : `Approve (${mergedApprovalQueue.length})`}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {section === 'mine' ? (
          <>
            {/* Request leave button */}
            {canSubmit ? (
              <Pressable
                style={[styles.primaryBtn, { backgroundColor: '#121212' }]}
                onPress={() => {
                  setShowForm((v) => !v);
                  setShowToilEarnForm(false);
                }}
              >
                <Text style={styles.primaryBtnText}>{showForm ? 'Close' : '+ Book time off'}</Text>
              </Pressable>
            ) : null}

            {showToilEarnForm && canSubmit ? (
              <View style={[styles.card, { backgroundColor: '#f0fdf9', borderColor: '#bbf7d0' }]}>
                <Text style={[styles.cardTitle, { color: textPrimary }]}>Add TOIL (overtime)</Text>
                <Text style={[styles.fieldLabel, { color: textSecondary }]}>Date worked</Text>
                <Pressable
                  style={[styles.dateBtn, { borderColor: border, backgroundColor: isDark ? '#2a2a2a' : '#fafafa' }]}
                  onPress={() => setShowToilWorkPicker(true)}
                >
                  <Text style={[styles.dateBtnText, { color: textPrimary }]}>{fmtDate(toIsoDate(toilEarnWorkDate))}</Text>
                </Pressable>
                {showToilWorkPicker ? (
                  <DateTimePicker
                    value={toilEarnWorkDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_e, d) => {
                      setShowToilWorkPicker(Platform.OS === 'ios');
                      if (d) setToilEarnWorkDate(d);
                    }}
                  />
                ) : null}
                <Text style={[styles.fieldLabel, { color: textSecondary, marginTop: 8 }]}>Amount</Text>
                <TextInput
                  value={toilEarnAmount}
                  onChangeText={setToilEarnAmount}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 1.5"
                  placeholderTextColor={textSecondary}
                  style={[styles.textArea, { borderColor: border, color: textPrimary, backgroundColor: isDark ? '#2a2a2a' : '#fafafa', minHeight: 44 }]}
                />
                <Text style={[styles.fieldLabel, { color: textSecondary, marginTop: 8 }]}>Unit</Text>
                <View style={[styles.segmentRow, { backgroundColor: isDark ? '#2a2a2a' : '#f0eeea', marginBottom: 8 }]}>
                  {(['minutes', 'hours', 'days'] as const).map((u) => (
                    <Pressable
                      key={u}
                      style={[styles.segment, toilEarnUnit === u && { backgroundColor: cardBg }]}
                      onPress={() => setToilEarnUnit(u)}
                    >
                      <Text
                        style={[
                          styles.segmentLabel,
                          { color: toilEarnUnit === u ? textPrimary : textSecondary, fontWeight: toilEarnUnit === u ? '600' : '400' },
                        ]}
                      >
                        {u === 'minutes' ? 'Min' : u === 'hours' ? 'Hours' : 'Days'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {toilEarnAmount && Number(toilEarnAmount) > 0 ? (
                  <Text style={{ fontSize: 13, color: '#065f46', marginBottom: 8 }}>
                    ≈ {formatToilMinutes(toilInputToMinutes(Number(toilEarnAmount), toilEarnUnit, toilMinutesPerDay), toilMinutesPerDay)}
                  </Text>
                ) : null}
                <Text style={[styles.fieldLabel, { color: textSecondary }]}>Note (optional)</Text>
                <TextInput
                  value={toilEarnNote}
                  onChangeText={setToilEarnNote}
                  placeholder="e.g. late cover"
                  placeholderTextColor={textSecondary}
                  style={[styles.textArea, { borderColor: border, color: textPrimary, backgroundColor: isDark ? '#2a2a2a' : '#fafafa' }]}
                />
                <Pressable
                  style={[styles.primaryBtn, { marginTop: 12, backgroundColor: '#008B60', opacity: busy ? 0.6 : 1 }]}
                  onPress={() => void submitToilEarn()}
                  disabled={busy}
                >
                  <Text style={styles.primaryBtnText}>{busy ? 'Sending…' : 'Submit for approval'}</Text>
                </Pressable>
              </View>
            ) : null}

            {/* Request form */}
            {showForm && canSubmit ? (
              <View style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}>
                <Text style={[styles.cardTitle, { color: textPrimary }]}>New leave request</Text>

                {/* Kind */}
                <Text style={[styles.fieldLabel, { color: textSecondary }]}>Type</Text>
                <View style={[styles.segmentRow, { backgroundColor: isDark ? '#2a2a2a' : '#f0eeea', marginBottom: 12 }]}>
                  {(['annual', 'toil', 'parental', 'bereavement', 'compassionate', 'study', 'unpaid'] as const).map((k) => (
                    <Pressable
                      key={k}
                      style={[styles.segment, formKind === k && { backgroundColor: cardBg }]}
                      onPress={() => {
                        setFormKind(k);
                        if (k !== 'parental') setFormParentalSubtype('maternity');
                      }}
                    >
                      <Text style={[styles.segmentLabel, { color: formKind === k ? textPrimary : textSecondary, fontWeight: formKind === k ? '600' : '400' }]}>
                        {kindLabel(k)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {formKind === 'parental' ? (
                  <>
                    <Text style={[styles.fieldLabel, { color: textSecondary }]}>Parental leave type</Text>
                    <View style={[styles.segmentRow, { backgroundColor: isDark ? '#2a2a2a' : '#f0eeea', marginBottom: 12 }]}>
                      {(['maternity', 'paternity', 'adoption', 'shared_parental'] as const).map((v) => (
                        <Pressable
                          key={v}
                          style={[styles.segment, formParentalSubtype === v && { backgroundColor: cardBg }]}
                          onPress={() => setFormParentalSubtype(v)}
                        >
                          <Text style={[styles.segmentLabel, { color: formParentalSubtype === v ? textPrimary : textSecondary, fontWeight: formParentalSubtype === v ? '600' : '400' }]}>
                            {parentalSubtypeLabel(v)}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                ) : null}
                <Text style={[styles.fieldLabel, { color: textSecondary }]}>Duration</Text>
                <View style={[styles.segmentRow, { backgroundColor: isDark ? '#2a2a2a' : '#f0eeea', marginBottom: 12 }]}>
                  {(['full', 'half'] as const).map((m) => (
                    <Pressable
                      key={m}
                      style={[styles.segment, formDayMode === m && { backgroundColor: cardBg }]}
                      onPress={() => setFormDayMode(m)}
                    >
                      <Text style={[styles.segmentLabel, { color: formDayMode === m ? textPrimary : textSecondary, fontWeight: formDayMode === m ? '600' : '400' }]}>
                        {m === 'full' ? 'Full day(s)' : 'Half day'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {formDayMode === 'half' ? (
                  <>
                    <Text style={[styles.fieldLabel, { color: textSecondary }]}>Half-day slot</Text>
                    <View style={[styles.segmentRow, { backgroundColor: isDark ? '#2a2a2a' : '#f0eeea', marginBottom: 12 }]}>
                      {(['am', 'pm'] as const).map((slot) => (
                        <Pressable
                          key={slot}
                          style={[styles.segment, formHalfDayPortion === slot && { backgroundColor: cardBg }]}
                          onPress={() => setFormHalfDayPortion(slot)}
                        >
                          <Text style={[styles.segmentLabel, { color: formHalfDayPortion === slot ? textPrimary : textSecondary, fontWeight: formHalfDayPortion === slot ? '600' : '400' }]}>
                            {slot === 'am' ? 'Morning (AM)' : 'Afternoon (PM)'}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                ) : null}

                {/* Dates */}
                <Text style={[styles.fieldLabel, { color: textSecondary }]}>Start date</Text>
                <Pressable
                  style={[styles.dateBtn, { borderColor: border, backgroundColor: isDark ? '#2a2a2a' : '#fafafa' }]}
                  onPress={() => setShowStartPicker(true)}
                >
                  <Text style={[styles.dateBtnText, { color: textPrimary }]}>{fmtDate(toIsoDate(formStart))}</Text>
                </Pressable>
                {showStartPicker ? (
                  <DateTimePicker
                    value={formStart}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_e, d) => {
                      setShowStartPicker(Platform.OS === 'ios');
                      if (d) setFormStart(d);
                    }}
                  />
                ) : null}

                <Text style={[styles.fieldLabel, { color: textSecondary }]}>End date</Text>
                <Pressable
                  style={[styles.dateBtn, { borderColor: border, backgroundColor: isDark ? '#2a2a2a' : '#fafafa' }]}
                  onPress={() => {
                    if (formDayMode === 'half') return;
                    setShowEndPicker(true);
                  }}
                >
                  <Text style={[styles.dateBtnText, { color: textPrimary }]}>{fmtDate(toIsoDate(formDayMode === 'half' ? formStart : formEnd))}</Text>
                </Pressable>
                {showEndPicker && formDayMode !== 'half' ? (
                  <DateTimePicker
                    value={formEnd}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_e, d) => {
                      setShowEndPicker(Platform.OS === 'ios');
                      if (d) setFormEnd(d);
                    }}
                  />
                ) : null}

                {bookingPreviewText ? (
                  <Text
                    style={[
                      styles.dayPreview,
                      {
                        color:
                          newLeaveOverlaps || exceedsAnnualAllowance ? '#b91c1c' : '#008B60',
                      },
                    ]}
                  >
                    {bookingPreviewText}
                  </Text>
                ) : null}

                <Text style={[styles.fieldLabel, { color: textSecondary }]}>Note (optional)</Text>
                <TextInput
                  value={formNote}
                  onChangeText={setFormNote}
                  placeholder="Reason or extra info…"
                  placeholderTextColor={textSecondary}
                  multiline
                  numberOfLines={3}
                  style={[styles.textArea, { borderColor: border, color: textPrimary, backgroundColor: isDark ? '#2a2a2a' : '#fafafa' }]}
                />

                <Pressable
                  style={[styles.primaryBtn, { marginTop: 12, backgroundColor: '#008B60', opacity: busy ? 0.6 : 1 }]}
                  onPress={() => void submitLeave()}
                  disabled={busy}
                >
                  <Text style={styles.primaryBtnText}>{busy ? 'Submitting…' : 'Submit request'}</Text>
                </Pressable>
              </View>
            ) : null}

            {myToilCredits.length > 0 ? (
              <>
                <Text style={[styles.sectionHeading, { color: textSecondary }]}>My overtime (TOIL) requests</Text>
                {myToilCredits.map((t) => {
                  const st = statusLabel(t.status);
                  return (
                    <View key={t.id} style={[styles.requestCard, { backgroundColor: cardBg, borderColor: border }]}>
                      <View style={styles.requestRow}>
                        <Text style={[styles.requestKind, { color: textPrimary }]}>Overtime credit</Text>
                        <Text style={[styles.requestStatus, { color: st.color }]}>{st.text}</Text>
                      </View>
                      <Text style={[styles.requestDates, { color: textSecondary }]}>
                        {fmtDate(t.work_date)} · {formatToilMinutes(t.minutes_earned, toilMinutesPerDay)}
                      </Text>
                      {t.note ? <Text style={[styles.requestNote, { color: textSecondary }]}>{t.note}</Text> : null}
                      {(t.status === 'approved' || t.status === 'rejected') && t.decision_note ? (
                        <Text style={[styles.decisionNote, { color: textSecondary }]}>
                          <Text style={{ fontWeight: '600', color: textPrimary }}>Approver note: </Text>
                          {t.decision_note}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </>
            ) : null}

            {/* My requests list */}
            <Text style={[styles.sectionHeading, { color: textSecondary }]}>My requests</Text>
            {myRequests.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: cardBg, borderColor: border }]}>
                <Text style={[styles.emptyText, { color: textSecondary }]}>No leave requests yet.</Text>
              </View>
            ) : (
              myRequests.map((r) => {
                const st = statusLabel(r.status);
                const days = daysBetween(r.start_date, r.end_date);
                return (
                  <View key={r.id} style={[styles.requestCard, { backgroundColor: cardBg, borderColor: border }]}>
                    <View style={styles.requestRow}>
                      <Text style={[styles.requestKind, { color: textPrimary }]}>{kindLabel(r.kind)}{r.kind === 'parental' && r.parental_subtype ? ` (${parentalSubtypeLabel(r.parental_subtype)})` : ''}</Text>
                      <Text style={[styles.requestStatus, { color: st.color }]}>{st.text}</Text>
                    </View>
                    <Text style={[styles.requestDates, { color: textSecondary }]}>
                      {fmtDate(r.start_date)} – {fmtDate(r.end_date)} · {r.half_day_portion ? `Half day (${r.half_day_portion.toUpperCase()})` : `${days} day${days === 1 ? '' : 's'}`}
                    </Text>
                    {r.note ? <Text style={[styles.requestNote, { color: textSecondary }]}>{r.note}</Text> : null}
                    {(r.status === 'approved' || r.status === 'rejected') && r.decision_note ? (
                      <Text style={[styles.decisionNote, { color: textSecondary }]}>
                        <Text style={{ fontWeight: '600', color: textPrimary }}>Approver note: </Text>
                        {r.decision_note}
                      </Text>
                    ) : null}
                    {r.status === 'pending' ? (
                      <Pressable onPress={() => void cancelRequest(r.id)} style={styles.cancelBtn}>
                        <Text style={styles.cancelBtnText}>Cancel request</Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })
            )}
          </>
        ) : (
          <>
            {/* Approve section */}
            <Text style={[styles.sectionHeading, { color: textSecondary }]}>
              Pending requests ({mergedApprovalQueue.length})
            </Text>
            {mergedApprovalQueue.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: cardBg, borderColor: border }]}>
                <Text style={[styles.emptyText, { color: textSecondary }]}>No pending requests to review.</Text>
              </View>
            ) : (
              mergedApprovalQueue.map((row) => {
                if (row.kind === 'leave') {
                  const r = row.leave;
                  const days = daysBetween(r.start_date, r.end_date);
                  const name = r.requester_name ?? 'Team member';
                  return (
                    <View key={row.key} style={[styles.requestCard, { backgroundColor: cardBg, borderColor: border }]}>
                      <Text style={[styles.requestKind, { color: textPrimary }]}>{name}</Text>
                      <Text style={[styles.requestDates, { color: textSecondary }]}>
                        {kindLabel(r.kind)}{r.kind === 'parental' && r.parental_subtype ? ` (${parentalSubtypeLabel(r.parental_subtype)})` : ''} · {fmtDate(r.start_date)} – {fmtDate(r.end_date)} · {r.half_day_portion ? `Half day (${r.half_day_portion.toUpperCase()})` : `${days} day${days === 1 ? '' : 's'}`}
                      </Text>
                      {r.note ? <Text style={[styles.requestNote, { color: textSecondary }]}>{r.note}</Text> : null}
                      <View style={styles.decideRow}>
                        <Pressable
                          style={[styles.approveBtn]}
                          onPress={() => openApprovalDialog('leave', r.id, true, name)}
                          disabled={busy}
                        >
                          <Text style={styles.approveBtnText}>Approve</Text>
                        </Pressable>
                        <Pressable
                          style={styles.declineBtn}
                          onPress={() => openApprovalDialog('leave', r.id, false, name)}
                          disabled={busy}
                        >
                          <Text style={styles.declineBtnText}>Decline</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                }
                const t = row.toil;
                const name = t.requester_name ?? 'Team member';
                return (
                  <View key={row.key} style={[styles.requestCard, { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' }]}>
                    <Text style={[styles.requestKind, { color: textPrimary }]}>{name}</Text>
                    <Text style={[styles.requestDates, { color: textSecondary }]}>
                      TOIL credit · {fmtDate(t.work_date)} · {formatToilMinutes(t.minutes_earned, toilMinutesPerDay)}
                    </Text>
                    {t.note ? <Text style={[styles.requestNote, { color: textSecondary }]}>{t.note}</Text> : null}
                    <View style={styles.decideRow}>
                      <Pressable
                        style={[styles.approveBtn]}
                        onPress={() => openApprovalDialog('toil_credit', t.id, true, name)}
                        disabled={busy}
                      >
                        <Text style={styles.approveBtnText}>Approve</Text>
                      </Pressable>
                      <Pressable
                        style={styles.declineBtn}
                        onPress={() => openApprovalDialog('toil_credit', t.id, false, name)}
                        disabled={busy}
                      >
                        <Text style={styles.declineBtnText}>Decline</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      <Modal
        visible={approvalModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!busy) {
            setApprovalModal(null);
            setApprovalNote('');
          }
        }}
      >
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Pressable
            style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
            onPress={() => {
              if (!busy) {
                setApprovalModal(null);
                setApprovalNote('');
              }
            }}
          />
          <View style={{ paddingHorizontal: 20, width: '100%', zIndex: 1 }}>
            <View style={[styles.modalCard, { backgroundColor: cardBg, borderColor: border }]}>
              <Text style={[styles.modalTitle, { color: textPrimary }]}>
                {approvalModal?.source === 'toil_credit'
                  ? approvalModal.approve
                    ? 'Approve TOIL credit'
                    : 'Decline TOIL credit'
                  : approvalModal?.approve
                    ? 'Approve leave request'
                    : 'Decline leave request'}
              </Text>
              {approvalModal ? (
                <Text style={[styles.modalSubtitle, { color: textSecondary }]}>
                  {approvalModal.name}  optional note for the employee.
                </Text>
              ) : null}
              <Text style={[styles.fieldLabel, { color: textSecondary, marginTop: 12 }]}>Note (optional)</Text>
              <TextInput
                value={approvalNote}
                onChangeText={setApprovalNote}
                placeholder="e.g. approved  enjoy your break"
                placeholderTextColor={textSecondary}
                multiline
                numberOfLines={3}
                editable={!busy}
                style={[styles.textArea, { borderColor: border, color: textPrimary, backgroundColor: isDark ? '#2a2a2a' : '#fafafa' }]}
              />
              <View style={styles.decideRow}>
                <Pressable
                  style={[styles.declineBtn, { flex: 1 }]}
                  onPress={() => {
                    if (!busy) {
                      setApprovalModal(null);
                      setApprovalNote('');
                    }
                  }}
                  disabled={busy}
                >
                  <Text style={styles.declineBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.approveBtn,
                    { flex: 1, backgroundColor: approvalModal?.approve ? '#008B60' : '#b91c1c', opacity: busy ? 0.6 : 1 },
                  ]}
                  onPress={() => void submitApprovalDecision()}
                  disabled={busy}
                >
                  <Text style={styles.approveBtnText}>
                    {busy ? 'Saving…' : approvalModal?.approve ? 'Approve' : 'Decline'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 48 },
  header: { marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  subtitle: { fontSize: 13, marginTop: 2 },
  yearChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  balanceRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  balanceCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
  },
  balanceNum: { fontSize: 22, fontWeight: '700' },
  balanceLabel: { fontSize: 10, marginTop: 2, textAlign: 'center', fontWeight: '500' },
  toilBanner: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    marginBottom: 12,
  },
  toilText: { fontSize: 13 },
  toilAddBtn: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  toilAddBtnText: { fontSize: 13, fontWeight: '600', color: '#065f46' },
  segmentRow: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
    gap: 3,
  },
  segment: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  segmentLabel: { fontSize: 13 },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 16,
  },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 15, fontWeight: '600', marginBottom: 14 },
  fieldLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  dateBtn: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  dateBtnText: { fontSize: 14 },
  dayPreview: { fontSize: 13, fontWeight: '600', marginBottom: 12 },
  textArea: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    fontSize: 14,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  sectionHeading: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  emptyCard: { borderRadius: 12, borderWidth: 1, padding: 20, alignItems: 'center', marginBottom: 16 },
  emptyText: { fontSize: 14 },
  requestCard: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10 },
  requestRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  requestKind: { fontSize: 14, fontWeight: '600', flex: 1 },
  requestStatus: { fontSize: 12, fontWeight: '500' },
  requestDates: { fontSize: 13, marginBottom: 4 },
  requestNote: { fontSize: 13, fontStyle: 'italic', marginBottom: 6 },
  decisionNote: { fontSize: 13, marginBottom: 6 },
  modalCard: { borderRadius: 14, borderWidth: 1, padding: 16 },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  modalSubtitle: { fontSize: 13, marginTop: 6 },
  cancelBtn: { alignSelf: 'flex-start', marginTop: 6 },
  cancelBtnText: { fontSize: 13, color: '#b91c1c', fontWeight: '500' },
  decideRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  approveBtn: { flex: 1, backgroundColor: '#008B60', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  approveBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  declineBtn: { flex: 1, borderWidth: 1, borderColor: '#fca5a5', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  declineBtnText: { color: '#b91c1c', fontSize: 13, fontWeight: '600' },
});
