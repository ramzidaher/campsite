'use client';

import {
  canCreateRota,
  canEditRotaShifts,
  canSubmitStaffAvailability,
  canTransferRotaOwnership,
  canViewRotaDepartmentScope,
  canViewRotaFullOrgGrid,
  type ProfileRole,
} from '@campsite/types';
import { createClient } from '@/lib/supabase/client';
import { queueEntityCalendarSync } from '@/lib/calendar/queueEntityCalendarSync';
import {
  addWeeks,
  endOfWeekExclusive,
  formatShiftTimeRange,
  startOfWeekMonday,
} from '@/lib/datetime';
import { useShellRefresh } from '@/hooks/useShellRefresh';
import { loadMyCalendarBusyForRotaWeek, type RotaCalendarBusyBlock } from '@/lib/rota/calendarBusyForRota';
import { friendlyDbError } from '@/lib/rota/friendlyDbError';
import { GRID_END_HOUR, localYmd } from '@/lib/rota/weekGridLayout';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { RotaHowItWorksPanel, RotaHowItWorksSubtitle } from '@/components/rota/RotaHowItWorks';
import { RotaMembersPanel } from '@/components/rota/RotaMembersPanel';
import { RotaRequestsPanel, type RequestShiftRef } from '@/components/rota/RotaRequestsPanel';
import { RotaQuickAddShiftPopover } from '@/components/rota/RotaQuickAddShiftPopover';
import { RotaStaffAvailabilityPanel } from '@/components/rota/RotaStaffAvailabilityPanel';
import { RotaWeekTimeGrid } from '@/components/rota/RotaWeekTimeGrid';
import {
  formatAvailabilityHint,
  staffAvailabilityHintForShift,
  type StaffAvailabilityHint,
  type StaffAvailabilityOverride,
  type StaffAvailabilityTemplate,
} from '@/lib/rota/staffAvailability';

type Profile = {
  id: string;
  org_id: string;
  role: ProfileRole;
  full_name: string;
  org_timezone?: string | null;
};

type RotaBrief = { id: string; title: string; kind: string } | null;

type ShiftRow = {
  id: string;
  dept_id: string | null;
  rota_id: string | null;
  user_id: string | null;
  role_label: string | null;
  start_time: string;
  end_time: string;
  notes: string | null;
  source: string;
  departments: { name: string } | null;
  assignee: { full_name: string } | null;
  rotas: RotaBrief;
};

type ViewMode = 'my' | 'team' | 'full';

type RotaPageSection = 'schedule' | 'requests' | 'setup' | 'availability';

type RotaRow = { id: string; title: string; kind: string; dept_id: string | null; status: string };
type StaffOption = { id: string; full_name: string; role: string; dept_ids: string[] };

const SHIFT_VARIANTS = [
  {
    bg: 'bg-[#e7e5e4]',
    border: 'border-[#d6d3d1]',
    text: 'text-[#44403c]',
  },
  {
    bg: 'bg-[#dcfce7]',
    border: 'border-[#bbf7d0]',
    text: 'text-[#166534]',
  },
  {
    bg: 'bg-[#fff7ed]',
    border: 'border-[#fed7aa]',
    text: 'text-[#9a3412]',
  },
  {
    bg: 'bg-[#f3e8ff]',
    border: 'border-[#e9d5ff]',
    text: 'text-[#6d28d9]',
  },
] as const;

function shiftVariant(key: string | null) {
  let h = 0;
  const s = key ?? '';
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return SHIFT_VARIANTS[h % 4];
}

function formatWeekRange(weekStart: Date): string {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const y1 = weekStart.getFullYear();
  const y2 = end.getFullYear();
  const m1 = weekStart.getMonth();
  const m2 = end.getMonth();
  const d1 = weekStart.getDate();
  const d2 = end.getDate();
  if (m1 === m2 && y1 === y2) {
    const month = weekStart.toLocaleString('en-GB', { timeZone: 'UTC',  month: 'long' });
    return `${d1}-${d2} ${month} ${y1}`;
  }
  return `${weekStart.toLocaleDateString('en-GB', { timeZone: 'UTC',  day: 'numeric', month: 'short' })} - ${end.toLocaleDateString('en-GB', { timeZone: 'UTC',  day: 'numeric', month: 'short', year: 'numeric' })}`;
}

const NAV_BTN =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#d4d2cc] bg-white text-sm text-[#5c5c5c] shadow-sm transition-colors hover:bg-[#f3f2ee]';

/** Primary actions - filled */
const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#121212] px-4 py-2.5 text-[13px] font-semibold text-[#faf9f6] shadow-sm transition hover:bg-[#2d2d2d] active:scale-[0.99]';

/** Secondary - outline */
const BTN_SECONDARY =
  'inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#d4d2cc] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#121212] shadow-sm transition hover:bg-[#f7f6f2] active:scale-[0.99]';

/** Tertiary - no border, subtle hover */
const BTN_GHOST =
  'inline-flex items-center justify-center rounded-lg px-3 py-2 text-[13px] font-medium text-[#5c5c5c] transition hover:bg-[#ebeae6]';

const SEGMENT_WRAP = 'inline-flex flex-wrap gap-1 rounded-xl border border-[#d4d2cc] bg-[#f3f2ee] p-1';
const SEGMENT_ACTIVE = 'rounded-lg bg-white px-3.5 py-2 text-[13px] font-semibold text-[#121212] shadow-sm';
const SEGMENT_IDLE =
  'rounded-lg px-3.5 py-2 text-[13px] font-medium text-[#6b6b6b] transition hover:text-[#121212]';

const QUICK_ADD_POPOVER_W = 380;
const QUICK_ADD_POPOVER_H = 420;

/** Anchor popover near the selected grid cell: horizontal centre on anchorX, vertical near anchorY (upper third of card). */
function clampQuickAddPosition(anchorX: number, anchorY: number): { top: number; left: number } {
  const margin = 12;
  const left = Math.min(
    Math.max(margin, anchorX - QUICK_ADD_POPOVER_W / 2),
    window.innerWidth - QUICK_ADD_POPOVER_W - margin,
  );
  const topOffset = 56;
  const top = Math.min(
    Math.max(margin, anchorY - topOffset),
    window.innerHeight - QUICK_ADD_POPOVER_H - margin,
  );
  return { top, left };
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `datetime-local` value from a **local** wall-time `Date` (do not round-trip through `toISOString()`). */
function localDateToDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function shiftsTimeOverlap(a: ShiftRow, b: ShiftRow): boolean {
  if (!a.user_id || !b.user_id || a.user_id !== b.user_id) return false;
  const as = new Date(a.start_time).getTime();
  const ae = new Date(a.end_time).getTime();
  const bs = new Date(b.start_time).getTime();
  const be = new Date(b.end_time).getTime();
  return as < be && bs < ae;
}

function timeRangesOverlap(aStartIso: string, aEndIso: string, bStartIso: string, bEndIso: string): boolean {
  const as = new Date(aStartIso).getTime();
  const ae = new Date(aEndIso).getTime();
  const bs = new Date(bStartIso).getTime();
  const be = new Date(bEndIso).getTime();
  if (!Number.isFinite(as) || !Number.isFinite(ae) || !Number.isFinite(bs) || !Number.isFinite(be)) return false;
  return as < be && bs < ae;
}

export function RotaClient({ profile }: { profile: Profile }) {
  const supabase = useMemo(() => createClient(), []);
  const editorRef = useRef<HTMLDivElement>(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date()));
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  /** My schedule only: org calendar events (manual / broadcast) so open slots can be judged against other commitments. */
  const [calendarBusy, setCalendarBusy] = useState<RotaCalendarBusyBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [managedDeptIds, setManagedDeptIds] = useState<string[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [view, setView] = useState<ViewMode>('my');
  const [pageSection, setPageSection] = useState<RotaPageSection>('schedule');
  const [listMode, setListMode] = useState(false);
  const [filterUser, setFilterUser] = useState<string>('');
  const [filterDept, setFilterDept] = useState<string>('');
  const [shiftEditorOpen, setShiftEditorOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<ShiftRow | null>(null);
  const [shiftSlotPreset, setShiftSlotPreset] = useState<{ startLocal: string; endLocal: string } | null>(null);
  const [quickAdd, setQuickAdd] = useState<null | {
    position: { top: number; left: number };
    startLocal: string;
    endLocal: string;
  }>(null);
  const [rotas, setRotas] = useState<RotaRow[]>([]);

  const canTeam = canViewRotaDepartmentScope(profile.role);
  const canFull = canViewRotaFullOrgGrid(profile.role);
  const canEdit = canEditRotaShifts(profile.role);
  const showSetupSection = canCreateRota(profile.role) || canEdit;
  const showAvailabilitySection = canSubmitStaffAvailability(profile.role);

  const [staffAvTemplates, setStaffAvTemplates] = useState<StaffAvailabilityTemplate[]>([]);
  const [staffAvOverrides, setStaffAvOverrides] = useState<StaffAvailabilityOverride[]>([]);

  const availabilityAnchor = useMemo(() => {
    if (editingShift) return new Date(editingShift.start_time);
    if (shiftSlotPreset?.startLocal) return new Date(shiftSlotPreset.startLocal);
    if (quickAdd?.startLocal) return new Date(quickAdd.startLocal);
    return weekStart;
  }, [editingShift, shiftSlotPreset, quickAdd, weekStart]);

  useEffect(() => {
    if (!canEdit || staff.length === 0) {
      setStaffAvTemplates([]);
      setStaffAvOverrides([]);
      return;
    }
    const ids = staff.map((s) => s.id);
    const mon = startOfWeekMonday(availabilityAnchor);
    const sun = new Date(mon);
    sun.setDate(sun.getDate() + 6);
    const fromStr = localYmd(mon);
    const toStr = localYmd(sun);
    let cancelled = false;
    void (async () => {
      const [tRes, oRes] = await Promise.all([
        supabase
          .from('rota_staff_availability_template')
          .select('user_id,weekday,start_time,end_time')
          .eq('org_id', profile.org_id)
          .in('user_id', ids),
        supabase
          .from('rota_staff_availability_override')
          .select('user_id,on_date,start_time,end_time')
          .eq('org_id', profile.org_id)
          .in('user_id', ids)
          .gte('on_date', fromStr)
          .lte('on_date', toStr),
      ]);
      if (cancelled) return;
      setStaffAvTemplates((tRes.data ?? []) as StaffAvailabilityTemplate[]);
      setStaffAvOverrides((oRes.data ?? []) as StaffAvailabilityOverride[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [canEdit, staff, profile.org_id, availabilityAnchor, supabase]);

  useEffect(() => {
    void (async () => {
      const [{ data: dm }, { data: deps }, { data: profs }, { data: ud }, { data: rotaRows }] = await Promise.all([
        supabase.from('dept_managers').select('dept_id').eq('user_id', profile.id),
        supabase.from('departments').select('id,name').eq('org_id', profile.org_id),
        supabase
          .from('coworker_directory_public')
          .select('id,full_name,role')
          .eq('org_id', profile.org_id)
          .eq('status', 'active'),
        supabase.from('user_departments').select('user_id,dept_id'),
        supabase.from('rotas').select('id,title,kind,dept_id,status').eq('org_id', profile.org_id).order('title'),
      ]);
      setManagedDeptIds((dm ?? []).map((r) => r.dept_id as string));
      setDepartments((deps ?? []) as { id: string; name: string }[]);
      const deptByUser = new Map<string, string[]>();
      for (const row of ud ?? []) {
        const uid = row.user_id as string;
        const did = row.dept_id as string;
        const list = deptByUser.get(uid) ?? [];
        list.push(did);
        deptByUser.set(uid, list);
      }
      setStaff(
        (profs ?? []).map((p) => ({
          id: p.id as string,
          full_name: (p.full_name as string) ?? 'Member',
          role: (p.role as string) ?? '',
          dept_ids: deptByUser.get(p.id as string) ?? [],
        }))
      );
      setRotas((rotaRows ?? []) as RotaRow[]);
    })();
  }, [supabase, profile.id, profile.org_id]);

  useEffect(() => {
    if (view === 'team' && !canTeam) setView('my');
    if (view === 'full' && !canFull) setView('my');
  }, [view, canTeam, canFull]);

  useEffect(() => {
    setQuickAdd(null);
  }, [weekStart]);

  useEffect(() => {
    if (listMode) setQuickAdd(null);
  }, [listMode]);

  useEffect(() => {
    if (pageSection !== 'schedule') setQuickAdd(null);
  }, [pageSection]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) setLoading(true);
    try {
    const from = weekStart.toISOString();
    const to = endOfWeekExclusive(weekStart).toISOString();

    const dm = new Map(departments.map((d) => [d.id, d.name]));
    const sm = new Map(staff.map((s) => [s.id, s.full_name]));

    let q = supabase
      .from('rota_shifts')
        .select('id, dept_id, rota_id, user_id, role_label, start_time, end_time, notes, source, rotas(id,title,kind)')
      .eq('org_id', profile.org_id)
      .gte('start_time', from)
      .lt('start_time', to)
      .order('start_time');

    if (view === 'my') {
      q = q.or(`user_id.eq.${profile.id},user_id.is.null`);
    } else if (view === 'team' && profile.role === 'manager') {
      if (!managedDeptIds.length) {
        setShifts([]);
        setCalendarBusy([]);
        return;
      }
      q = q.in('dept_id', managedDeptIds);
    }

    const busyPromise =
      view === 'my'
        ? loadMyCalendarBusyForRotaWeek(supabase, {
            orgId: profile.org_id,
            profileId: profile.id,
            fromIso: from,
            toIso: to,
          })
        : Promise.resolve([] as RotaCalendarBusyBlock[]);

    const [{ data, error }, busyRows] = await Promise.all([q, busyPromise]);
    if (error) {
      console.error(error);
      setShifts([]);
      setCalendarBusy([]);
    } else {
      let rows: ShiftRow[] = (data ?? []).map((r) => {
        const deptId = r.dept_id as string | null;
        const uid = r.user_id as string | null;
          const rotRaw = (r as unknown as { rotas?: unknown }).rotas;
          const rot: RotaBrief =
            rotRaw == null
              ? null
              : Array.isArray(rotRaw)
                ? ((rotRaw[0] as { id: string; title: string; kind: string } | undefined) ?? null)
                : (rotRaw as { id: string; title: string; kind: string });
        return {
          id: r.id as string,
          dept_id: deptId,
            rota_id: (r.rota_id as string | null) ?? null,
          user_id: uid,
          role_label: r.role_label as string | null,
          start_time: r.start_time as string,
          end_time: r.end_time as string,
          notes: r.notes as string | null,
          source: r.source as string,
          departments: deptId ? { name: dm.get(deptId) ?? '-' } : null,
          assignee: uid ? { full_name: sm.get(uid) ?? '-' } : null,
            rotas: rot,
        };
      });
      if (filterUser) rows = rows.filter((r) => r.user_id === filterUser);
      if (filterDept) rows = rows.filter((r) => r.dept_id === filterDept);
      setShifts(rows);
      setCalendarBusy(view === 'my' ? busyRows : []);
    }
    } catch (e) {
      console.error(e);
      setShifts([]);
      setCalendarBusy([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [
    supabase,
    profile.org_id,
    profile.id,
    weekStart,
    view,
    managedDeptIds,
    departments,
    staff,
    filterUser,
    filterDept,
    profile.role,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  useShellRefresh(() => void load({ silent: true }));

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const ch = supabase
      .channel(`rota-shifts-cal-${profile.org_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rota_shifts',
          filter: `org_id=eq.${profile.org_id}`,
        },
        () => {
          void loadRef.current({ silent: true });
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'calendar_events',
          filter: `org_id=eq.${profile.org_id}`,
        },
        () => {
          void loadRef.current({ silent: true });
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'calendar_event_attendees',
          filter: `org_id=eq.${profile.org_id}`,
        },
        () => {
          void loadRef.current({ silent: true });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [supabase, profile.org_id]);

  const persistShiftMove = useCallback(
    async (shiftId: string, start_time: string, end_time: string) => {
      const { error } = await supabase.from('rota_shifts').update({ start_time, end_time }).eq('id', shiftId);
      if (error) {
        window.alert(friendlyDbError(error.message));
        return;
      }
      queueEntityCalendarSync({ type: 'shift', id: shiftId, action: 'upsert' });
      await load({ silent: true });
    },
    [supabase, load],
  );

  const days = useMemo(() => {
    const out: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      out.push(d);
    }
    return out;
  }, [weekStart]);

  const overlapShiftIds = useMemo(() => {
    const s = new Set<string>();
    for (let i = 0; i < shifts.length; i++) {
      for (let j = i + 1; j < shifts.length; j++) {
        if (shiftsTimeOverlap(shifts[i], shifts[j])) {
          s.add(shifts[i].id);
          s.add(shifts[j].id);
        }
      }
    }
    return s;
  }, [shifts]);

  const overlapCalendarBusyIds = useMemo(() => {
    if (view !== 'my' || calendarBusy.length === 0) return new Set<string>();
    const overlap = new Set<string>();
    for (const c of calendarBusy) {
      for (const s of shifts) {
        if (timeRangesOverlap(c.start_time, c.end_time, s.start_time, s.end_time)) {
          overlap.add(c.id);
          break;
        }
      }
    }
    return overlap;
  }, [view, calendarBusy, shifts]);

  const listRowsByDay = useMemo(() => {
    type ListRow =
      | { kind: 'shift'; id: string; startTimeMs: number; shift: ShiftRow }
      | { kind: 'calendar'; id: string; startTimeMs: number; calendar: RotaCalendarBusyBlock };
    const rows: ListRow[] = [];
    for (const s of shifts) {
      rows.push({ kind: 'shift', id: s.id, startTimeMs: new Date(s.start_time).getTime(), shift: s });
    }
    if (view === 'my') {
      for (const c of calendarBusy) {
        rows.push({ kind: 'calendar', id: c.id, startTimeMs: new Date(c.start_time).getTime(), calendar: c });
      }
    }
    rows.sort((a, b) => a.startTimeMs - b.startTimeMs);
    const groups = new Map<string, { label: string; rows: ListRow[] }>();
    for (const row of rows) {
      const start = row.kind === 'shift' ? row.shift.start_time : row.calendar.start_time;
      const d = new Date(start);
      const ymd = localYmd(d);
      if (!groups.has(ymd)) {
        groups.set(ymd, {
          label: d.toLocaleDateString('en-GB', { timeZone: 'UTC',  weekday: 'short', day: 'numeric', month: 'long' }),
          rows: [],
        });
      }
      groups.get(ymd)?.rows.push(row);
    }
    return [...groups.entries()].map(([ymd, data]) => ({ ymd, label: data.label, rows: data.rows }));
  }, [shifts, calendarBusy, view]);

  const draftSlotHighlight = useMemo(() => {
    if (!quickAdd) return null;
    const startD = new Date(quickAdd.startLocal);
    const endD = new Date(quickAdd.endLocal);
    if (Number.isNaN(startD.getTime()) || Number.isNaN(endD.getTime())) return null;
    const dayIndex = days.findIndex((dd) => localYmd(dd) === localYmd(startD));
    if (dayIndex < 0) return null;
    const startMin = startD.getHours() * 60 + startD.getMinutes();
    let endMin =
      localYmd(endD) !== localYmd(startD)
        ? GRID_END_HOUR * 60
        : endD.getHours() * 60 + endD.getMinutes();
    if (endMin <= startMin) endMin = startMin + 60;
    return {
      dayIndex,
      startMin,
      endMin,
      primary: '(No title)',
      secondary: formatShiftTimeRange(startD.toISOString(), endD.toISOString(), profile.org_timezone),
    };
  }, [quickAdd, days, profile.org_timezone]);

  const requestShiftRefs = useMemo((): { my: RequestShiftRef[]; swap: RequestShiftRef[] } => {
    const my: RequestShiftRef[] = [];
    const swap: RequestShiftRef[] = [];
    for (const s of shifts) {
      const ref: RequestShiftRef = {
        id: s.id,
        start_time: s.start_time,
        end_time: s.end_time,
        role_label: s.role_label,
        assigneeName: s.assignee?.full_name ?? (s.user_id ? null : 'Open slot'),
      };
      if (s.user_id === profile.id) my.push(ref);
      else if (s.user_id) swap.push(ref);
    }
    return { my, swap };
  }, [shifts, profile.id]);

  function exportCsv() {
    const lines = [
      ['id', 'dept', 'staff', 'role', 'start', 'end', 'notes', 'source'].join(','),
      ...shifts.map((s) =>
        [
          s.id,
          s.departments?.name ?? '',
          s.assignee?.full_name ?? '',
          s.role_label ?? '',
          s.start_time,
          s.end_time,
          (s.notes ?? '').replaceAll(',', ';'),
          s.source,
        ].join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `rota-${weekStart.toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  function openAddShift() {
    setPageSection('schedule');
    setEditingShift(null);
    setShiftSlotPreset(null);
    setShiftEditorOpen(true);
    setTimeout(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  function openQuickAddFromGrid(detail: {
    dayIndex: number;
    startMinutesFromMidnight: number;
    endMinutesFromMidnight: number;
    clientX: number;
    clientY: number;
    popoverAnchorX: number;
    popoverAnchorY: number;
  }) {
    const d = days[detail.dayIndex];
    if (!d) return;
    const startMin = detail.startMinutesFromMidnight;
    let endMin = detail.endMinutesFromMidnight;
    if (endMin <= startMin) endMin = startMin + 60;

    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    start.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    end.setHours(Math.floor(endMin / 60), endMin % 60, 0, 0);
    if (end <= start) {
      end.setTime(start.getTime() + 60 * 60 * 1000);
    }
    setPageSection('schedule');
    setQuickAdd({
      position: clampQuickAddPosition(detail.popoverAnchorX, detail.popoverAnchorY),
      startLocal: localDateToDatetimeLocalValue(start),
      endLocal: localDateToDatetimeLocalValue(end),
    });
  }

  function openEditShift(s: ShiftRow) {
    setPageSection('schedule');
    setShiftSlotPreset(null);
    setEditingShift(s);
    setShiftEditorOpen(true);
    setTimeout(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  function dismissShiftEditor() {
    setEditingShift(null);
    setShiftSlotPreset(null);
    setShiftEditorOpen(false);
  }

  const scopeSegments = [
    { mode: 'my' as const, label: 'My schedule', show: true },
    { mode: 'team' as const, label: 'Department', show: canTeam },
    { mode: 'full' as const, label: 'Whole organisation', show: canFull },
  ].filter((x) => x.show);

  const fieldSelect =
    'rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-2.5 py-2 text-sm text-[#121212] outline-none focus:border-[#121212] focus:ring-[3px] focus:ring-[#121212]/10';

  function shiftTitleLines(s: ShiftRow): { time: string; primary: string; secondary: string | null } {
    const time = formatShiftTimeRange(s.start_time, s.end_time, profile.org_timezone);
    const rotaBit = s.rotas?.title ? s.rotas.title : null;
    if (view === 'my') {
      return {
        time,
        primary: rotaBit ?? s.departments?.name ?? 'Shift',
        secondary: [s.role_label, s.departments?.name].filter(Boolean).join(' · ') || null,
      };
    }
    return {
      time,
      primary: s.assignee?.full_name ?? 'Open slot',
      secondary: [rotaBit, s.departments?.name, s.role_label].filter(Boolean).join(' · ') || null,
    };
  }

  async function claimOpenShift(shiftId: string) {
    const { error } = await supabase.rpc('rota_claim_open_shift', { p_shift_id: shiftId });
    if (error) window.alert(friendlyDbError(error.message));
    else void load({ silent: true });
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6">
      <div className="mb-6 campsite-stack-sm">
        <h1 className="campsite-title text-[#121212]">Rota</h1>
        <RotaHowItWorksSubtitle role={profile.role} />
      </div>

      <RotaHowItWorksPanel role={profile.role} />

      <nav className="mb-6 flex flex-wrap gap-2" aria-label="Rota sections">
        <button
          type="button"
          onClick={() => setPageSection('schedule')}
          aria-pressed={pageSection === 'schedule'}
          className={pageSection === 'schedule' ? SEGMENT_ACTIVE : SEGMENT_IDLE}
        >
          Schedule
        </button>
        <button
          type="button"
          onClick={() => setPageSection('requests')}
          aria-pressed={pageSection === 'requests'}
          className={pageSection === 'requests' ? SEGMENT_ACTIVE : SEGMENT_IDLE}
        >
          Requests &amp; swaps
        </button>
        {showAvailabilitySection ? (
          <button
            type="button"
            onClick={() => setPageSection('availability')}
            aria-pressed={pageSection === 'availability'}
            className={pageSection === 'availability' ? SEGMENT_ACTIVE : SEGMENT_IDLE}
          >
            My availability
          </button>
        ) : null}
        {showSetupSection ? (
          <button
            type="button"
            onClick={() => setPageSection('setup')}
            aria-pressed={pageSection === 'setup'}
            className={pageSection === 'setup' ? SEGMENT_ACTIVE : SEGMENT_IDLE}
          >
            Rotas &amp; access
          </button>
        ) : null}
      </nav>

      {pageSection === 'schedule' ? (
        <div className="rounded-2xl border border-[#e4e2dc] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#ebe9e4] px-4 py-4 sm:px-6">
            <p className="mb-3 text-[12px] font-medium uppercase tracking-wide text-[#9b9b9b]">View</p>
            <div className={SEGMENT_WRAP}>
        {scopeSegments.map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            onClick={() => setView(mode)}
            aria-pressed={view === mode}
                  className={view === mode ? SEGMENT_ACTIVE : SEGMENT_IDLE}
          >
            {label}
          </button>
        ))}
            </div>
            {canTeam ? (
              <p className="mt-3 max-w-2xl text-left text-pretty text-[12px] leading-relaxed text-[#6b6b6b]">
                <strong className="font-semibold text-[#121212]">Department</strong> shows shifts in the departments
                you work with. If you are a manager, that usually means departments you{'\u00A0'}manage.
              </p>
            ) : null}
            {!canTeam ? (
              <p className="mt-3 max-w-xl text-[12px] leading-relaxed text-[#6b6b6b]">
                Only <strong className="font-semibold text-[#121212]">My schedule</strong> is available for your role  - 
                coordinators, managers, and org admins also get wider views.
              </p>
            ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ebe9e4] bg-[#faf9f6] px-4 py-4 sm:px-6">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button
            type="button"
            className={NAV_BTN}
            aria-label="Previous week"
            onClick={() => setWeekStart((w) => addWeeks(w, -1))}
          >
            ‹
          </button>
          <div className="flex min-w-0 flex-col items-center gap-0.5 px-2 sm:min-w-[160px]">
            <span className="font-authSerif text-base text-center text-[#121212]">
              {formatWeekRange(weekStart)}
            </span>
            <button
              type="button"
              className="text-[12.5px] text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]"
              onClick={() => setWeekStart(startOfWeekMonday(new Date()))}
            >
              Today
            </button>
            {view === 'my' && calendarBusy.length > 0 ? (
              <Link
                href="/calendar"
                className="text-[12px] font-medium text-[#5b21b6] underline underline-offset-2 hover:text-[#4c1d95]"
              >
                Open calendar
              </Link>
            ) : null}
          </div>
          <button
            type="button"
            className={NAV_BTN}
            aria-label="Next week"
            onClick={() => setWeekStart((w) => addWeeks(w, 1))}
          >
            ›
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-xl border border-[#d4d2cc] bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setListMode(false)}
              className={[
                'border-r border-[#ebe9e4] px-4 py-2 text-[13px] font-semibold transition-colors',
                !listMode ? 'bg-[#121212] text-[#faf9f6]' : 'text-[#5c5c5c] hover:bg-[#f7f6f2]',
              ].join(' ')}
            >
              Week
            </button>
            <button
              type="button"
              onClick={() => setListMode(true)}
              className={[
                'px-4 py-2 text-[13px] font-semibold transition-colors',
                listMode ? 'bg-[#121212] text-[#faf9f6]' : 'text-[#5c5c5c] hover:bg-[#f7f6f2]',
              ].join(' ')}
            >
              List
            </button>
          </div>
          {canFull ? (
            <Link href="/admin/rota-import" className={BTN_SECONDARY}>
            Import Sheets
            </Link>
          ) : null}
          {canFull ? (
            <button type="button" className={BTN_GHOST} onClick={() => exportCsv()}>
              Export CSV
            </button>
          ) : null}
          {canEdit ? (
            <button type="button" className={BTN_PRIMARY} onClick={openAddShift}>
              Add shift
            </button>
          ) : null}
        </div>
      </div>

      {(view === 'team' || view === 'full') && (
        <div className="flex flex-wrap gap-3 border-b border-[#ebe9e4] bg-[#faf9f6] px-4 py-3 sm:px-6">
      <label className="flex items-center gap-2 text-[13px] text-[#6b6b6b]">
            Staff
            <select className={fieldSelect} value={filterUser} onChange={(e) => setFilterUser(e.target.value)}>
              <option value="">All</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </label>
          {view === 'full' ? (
            <label className="flex items-center gap-2 text-[13px] text-[#6b6b6b]">
              Department
              <select className={fieldSelect} value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
                <option value="">All</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      )}

      <div className="overflow-x-auto px-4 py-6 sm:px-6">
        {loading ? (
          <p className="text-sm text-[#6b6b6b]">Loading...</p>
        ) : listMode ? (
          <ul className="flex flex-col gap-3">
            {shifts.length === 0 && calendarBusy.length === 0 ? (
              <li className="rounded-xl border border-dashed border-[#d4d2cc] bg-[#faf9f6] px-5 py-8 text-center">
                <p className="text-[15px] font-medium text-[#121212]">No shifts this week</p>
                <p className="mt-1 text-[13px] text-[#6b6b6b]">Try another week or switch to Department / Full rota.</p>
                {canEdit ? (
                  <button type="button" className={`${BTN_PRIMARY} mt-4`} onClick={openAddShift}>
                    Add a shift
                  </button>
                ) : null}
              </li>
            ) : (
              listRowsByDay.map((group) => (
                <li key={group.ymd} className="space-y-2.5">
                  <div className="flex items-center gap-2 px-1">
                    <span className="shrink-0 text-[11px] font-semibold uppercase tracking-widest text-[#8c8c8c]">
                      {group.label}
                    </span>
                    <span className="h-px flex-1 bg-[#e8e8e8]" />
                  </div>
                  <ul className="space-y-2">
                    {group.rows.map((row) => {
                      if (row.kind === 'shift') {
                        const s = row.shift;
                        const v = shiftVariant(s.dept_id ?? s.id);
                        const { time, primary, secondary } = shiftTitleLines(s);
                        const hasConflict = overlapShiftIds.has(s.id);
                        return (
                          <li key={s.id} className="flex items-start gap-3 rounded-xl border border-[#d8d8d8] bg-white px-[18px] py-3">
                            <span className={`mt-1 h-8 w-1 shrink-0 rounded-full ${v.bg} ring-1 ${v.border}`} aria-hidden />
                            <div className="min-w-0 flex-1">
                              <div className={`text-[11.5px] font-semibold ${v.text}`}>{time}</div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-2 font-medium text-[#121212]">
                                {primary}
                                {hasConflict ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                                    <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-amber-300 text-[9px] leading-none">!</span>
                                    Conflict
                                  </span>
                                ) : null}
                              </div>
                              {secondary ? (
                                <div className="mt-0.5 truncate text-[12.5px] text-[#6b6b6b]" title={secondary}>
                                  {secondary}
                                </div>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 flex-col gap-1">
                              {canEdit ? (
                                <button
                                  type="button"
                                  className="rounded-lg border border-[#d8d8d8] px-2.5 py-1 text-[11.5px] text-[#121212] hover:bg-[#f5f4f1]"
                                  onClick={() => openEditShift(s)}
                                >
                                  Edit
                                </button>
                              ) : null}
                              {s.user_id === null ? (
                                <button
                                  type="button"
                                  className="rounded-lg border border-[#d8d8d8] px-2.5 py-1 text-[11.5px] text-[#121212] hover:bg-[#f5f4f1]"
                                  onClick={() => void claimOpenShift(s.id)}
                                >
                                  Claim
                                </button>
                              ) : null}
                            </div>
                          </li>
                        );
                      }
                      const c = row.calendar;
                      const hasConflict = overlapCalendarBusyIds.has(c.id);
                      return (
                        <li key={`cal-${c.id}`} className="flex items-start gap-3 rounded-xl border border-[#ddd6fe] bg-[#f5f3ff] px-[18px] py-3">
                          <span className="mt-1 h-8 w-1 shrink-0 rounded-full bg-[#a78bfa] ring-1 ring-[#c4b5fd]" aria-hidden />
                          <div className="min-w-0 flex-1">
                            <div className="text-[11.5px] font-semibold text-[#5b21b6]">
                              {formatShiftTimeRange(c.start_time, c.end_time, profile.org_timezone)}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[14px] font-medium text-[#121212]">
                              {c.title}
                              {hasConflict ? (
                                <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                                  <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-amber-300 text-[9px] leading-none">!</span>
                                  Conflict
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-0.5 text-[12.5px] text-[#6b6b6b]">From org calendar (not a shift)</div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))
            )}
          </ul>
        ) : (
          <div className="space-y-3">
            {shifts.length === 0 && calendarBusy.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#d4d2cc] bg-[#faf9f6] px-4 py-3 text-center sm:px-5">
                <p className="text-[14px] font-medium text-[#121212]">No shifts this week</p>
                <p className="mt-0.5 text-[13px] text-[#6b6b6b]">
                  {canEdit
                    ? 'Drag on the week grid to select a time range (or click for a one-hour slot), or use Add shift above.'
                    : 'Shifts you can see will appear in the grid when they exist.'}
                </p>
                {canEdit ? (
                  <button type="button" className={`${BTN_PRIMARY} mt-3`} onClick={openAddShift}>
                    Add a shift
                  </button>
                ) : null}
                  </div>
            ) : null}
            <RotaWeekTimeGrid
              days={days}
              shifts={shifts}
              shiftVariant={shiftVariant}
              shiftTitleLines={shiftTitleLines}
              overlapShiftIds={overlapShiftIds}
              canEdit={canEdit}
              onShiftClick={(s) => {
                if (canEdit) {
                  openEditShift(s);
                  return;
                }
                if (s.user_id === null) {
                  void claimOpenShift(s.id);
                }
              }}
              onShiftTimesUpdated={(id, start, end) => persistShiftMove(id, start, end)}
              onBackgroundSlotClick={canEdit ? (d) => openQuickAddFromGrid(d) : undefined}
              draftSlotHighlight={canEdit ? draftSlotHighlight : null}
              calendarBusyBlocks={view === 'my' ? calendarBusy : undefined}
            />
                    </div>
                  )}
                </div>

          {canEdit && shiftEditorOpen ? (
            <div ref={editorRef} className="border-t border-[#ebe9e4] px-4 py-5 sm:px-6">
              <ShiftEditor
                profile={profile}
                departments={departments}
                staff={staff}
                managedDeptIds={managedDeptIds}
                rotas={rotas}
                requireRota={profile.role === 'coordinator'}
                prefillAssigneeUserId={view === 'my' ? profile.id : null}
                editingShift={editingShift}
                slotPreset={shiftSlotPreset}
                availabilityTemplates={staffAvTemplates}
                availabilityOverrides={staffAvOverrides}
                onDismiss={dismissShiftEditor}
                onSaved={() => {
                  setEditingShift(null);
                  setShiftSlotPreset(null);
                  setShiftEditorOpen(false);
                  void load({ silent: true });
                }}
                onRotasUpdated={() =>
                  void supabase
                    .from('rotas')
                    .select('id,title,kind,dept_id,status')
                    .eq('org_id', profile.org_id)
                    .order('title')
                    .then(({ data }) => setRotas((data ?? []) as RotaRow[]))
                }
              />
                </div>
          ) : null}
            </div>
      ) : pageSection === 'requests' ? (
        <RotaRequestsPanel
          profile={profile}
          myShifts={requestShiftRefs.my}
          swapTargets={requestShiftRefs.swap}
          onRefresh={() => void load({ silent: true })}
        />
      ) : pageSection === 'availability' ? (
        <div className="rounded-2xl border border-[#e4e2dc] bg-white px-4 py-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:px-8 sm:py-8">
          <RotaStaffAvailabilityPanel profileId={profile.id} orgId={profile.org_id} />
        </div>
      ) : (
        <div className="space-y-6">
          <p className="text-[14px] leading-relaxed text-[#5c5c5c]">
            Create <strong className="font-semibold text-[#121212]">rotas</strong> (named schedules), publish or draft
            them, transfer ownership, and choose who is invited to each rota. To place{' '}
            <strong className="font-semibold text-[#121212]">shifts</strong> on the calendar, use the{' '}
            <strong className="font-semibold text-[#121212]">Schedule</strong> tab and Add shift.
          </p>
          {canCreateRota(profile.role) ? (
            <RotaManagePanel
              profile={profile}
              departments={departments}
              managedDeptIds={managedDeptIds}
              rotas={rotas}
              onRotasChange={(next) => setRotas(next)}
            />
          ) : null}
          {canEdit ? (
            <RotaMembersPanel rotas={rotas.map((r) => ({ id: r.id, title: r.title }))} staff={staff} />
          ) : null}
        </div>
      )}
      {quickAdd && pageSection === 'schedule' ? (
        <RotaQuickAddShiftPopover
          orgId={profile.org_id}
          profileId={profile.id}
          assignToSelfIfUnassigned={view === 'my'}
          profileRole={profile.role}
          departments={departments}
          staff={staff}
          managedDeptIds={managedDeptIds}
          rotas={rotas}
          requireRota={profile.role === 'coordinator'}
          availabilityTemplates={staffAvTemplates}
          availabilityOverrides={staffAvOverrides}
          position={quickAdd.position}
          startLocal={quickAdd.startLocal}
          endLocal={quickAdd.endLocal}
          onTimesChange={(startLocal, endLocal) =>
            setQuickAdd((q) => (q ? { ...q, startLocal, endLocal } : null))
          }
          onClose={() => setQuickAdd(null)}
          onCreated={async () => {
            await load({ silent: true });
          }}
          onMoreOptions={() => {
            setShiftSlotPreset({
              startLocal: quickAdd.startLocal,
              endLocal: quickAdd.endLocal,
            });
            setQuickAdd(null);
            setEditingShift(null);
            setShiftEditorOpen(true);
            setTimeout(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
          }}
        />
      ) : null}
    </div>
  );
}

function RotaManagePanel({
  profile,
  departments,
  managedDeptIds,
  rotas,
  onRotasChange,
}: {
  profile: Profile;
  departments: { id: string; name: string }[];
  managedDeptIds: string[];
  rotas: RotaRow[];
  onRotasChange: (r: RotaRow[]) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('New rota');
  const [kind, setKind] = useState('shift');
  const [deptId, setDeptId] = useState('');
  const [newRotaStatus, setNewRotaStatus] = useState<'draft' | 'published'>('published');
  const [msg, setMsg] = useState<string | null>(null);
  const [xferRota, setXferRota] = useState('');
  const [xferUser, setXferUser] = useState('');
  const [staff, setStaff] = useState<{ id: string; full_name: string }[]>([]);

  const deptOpts =
    profile.role === 'manager'
      ? departments.filter((d) => managedDeptIds.includes(d.id))
      : departments;

  useEffect(() => {
    void supabase
      .from('profiles')
      .select('id,full_name')
      .eq('org_id', profile.org_id)
      .eq('status', 'active')
      .then(({ data }) => setStaff((data ?? []) as { id: string; full_name: string }[]));
  }, [supabase, profile.org_id]);

  async function createRota() {
    setMsg(null);
    if (profile.role === 'manager' && !deptId) {
      setMsg(
        'Choose a department you manage. Managers can only create rotas tied to one of their departments.',
      );
      return;
    }
    const { data, error } = await supabase
      .from('rotas')
      .insert({
        org_id: profile.org_id,
        title: title.trim() || 'Rota',
        kind,
        owner_id: profile.id,
        dept_id: deptId || null,
        status: newRotaStatus,
        published_at: newRotaStatus === 'published' ? new Date().toISOString() : null,
      })
      .select('id,title,kind,dept_id,status')
      .single();
    if (error) {
      setMsg(friendlyDbError(error.message));
      return;
    }
    onRotasChange([...rotas, data as RotaRow]);
    setOpen(false);
  }

  async function transfer() {
    setMsg(null);
    if (!xferRota || !xferUser) {
      setMsg('Pick rota and new owner.');
      return;
    }
    const { error } = await supabase.rpc('rota_transfer_owner', {
      p_rota_id: xferRota,
      p_new_owner_id: xferUser,
    });
    if (error) setMsg(friendlyDbError(error.message));
    else {
      setXferRota('');
      setXferUser('');
      const { data } = await supabase
        .from('rotas')
        .select('id,title,kind,dept_id,status')
        .eq('org_id', profile.org_id)
        .order('title');
      onRotasChange((data ?? []) as RotaRow[]);
    }
  }

  async function setRotaStatus(rotaId: string, status: 'draft' | 'published') {
    setMsg(null);
    const { error } = await supabase
      .from('rotas')
      .update({
        status,
        published_at: status === 'published' ? new Date().toISOString() : null,
      })
      .eq('id', rotaId);
    if (error) setMsg(friendlyDbError(error.message));
    else {
      const { data } = await supabase
        .from('rotas')
        .select('id,title,kind,dept_id,status')
        .eq('org_id', profile.org_id)
        .order('title');
      onRotasChange((data ?? []) as RotaRow[]);
    }
  }

              return (
    <div className="rounded-2xl border border-[#e4e2dc] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-7">
                    <button
                      type="button"
        className={BTN_GHOST}
        onClick={() => setOpen(!open)}
      >
        {open ? 'Hide rota admin tools' : 'Show rota admin tools'}
                    </button>
      {open ? (
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div className="rounded-xl border border-[#ebe9e4] bg-[#faf9f6] p-5 sm:p-6">
            <h3 className="font-authSerif text-[17px] text-[#121212]">Create rota</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-[#6b6b6b]">
              {profile.role === 'manager'
                ? 'Pick a department you manage - required for your role.'
                : 'Department is optional for org admins and coordinators.'}
            </p>
            <label className="mt-4 block text-[13px] font-medium text-[#121212]">
              Title
              <input
                className="mt-1.5 w-full rounded-xl border border-[#d4d2cc] bg-white px-3 py-2.5 text-sm text-[#121212] outline-none focus:border-[#121212] focus:ring-2 focus:ring-[#121212]/10"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="mt-4 block text-[13px] font-medium text-[#121212]">
              Kind
              <select
                className="mt-1.5 w-full rounded-xl border border-[#d4d2cc] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#121212] focus:ring-2 focus:ring-[#121212]/10"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                <option value="shift">Shift</option>
                <option value="activity">Activity</option>
                <option value="reception">Reception</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="mt-4 block text-[13px] font-medium text-[#121212]">
              Department
              {profile.role === 'manager' ? (
                <span className="font-normal text-[#b45309]"> (required)</span>
              ) : (
                <span className="font-normal text-[#6b6b6b]"> (optional)</span>
              )}
              <select
                className="mt-1.5 w-full rounded-xl border border-[#d4d2cc] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#121212] focus:ring-2 focus:ring-[#121212]/10"
                value={deptId}
                onChange={(e) => setDeptId(e.target.value)}
              >
                <option value="">-</option>
                {deptOpts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-4 block text-[13px] font-medium text-[#121212]">
              Visibility
              <select
                className="mt-1.5 w-full rounded-xl border border-[#d4d2cc] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#121212] focus:ring-2 focus:ring-[#121212]/10"
                value={newRotaStatus}
                onChange={(e) => setNewRotaStatus(e.target.value as 'draft' | 'published')}
              >
                <option value="published">Published (visible to roster)</option>
                <option value="draft">Draft (editors only)</option>
              </select>
            </label>
            <button type="button" className={`${BTN_PRIMARY} mt-5 w-full sm:w-auto`} onClick={() => void createRota()}>
              Create rota
            </button>
                          </div>
          {canTransferRotaOwnership(profile.role) ? (
            <div className="rounded-xl border border-[#ebe9e4] bg-[#faf9f6] p-5 sm:p-6">
              <h3 className="font-authSerif text-[17px] text-[#121212]">Transfer ownership</h3>
              <p className="mt-1 text-[13px] text-[#6b6b6b]">Org admin only - hand a rota to another staff member.</p>
              <label className="mt-4 block text-[13px] font-medium text-[#121212]">
                Rota
                <select
                  className="mt-1.5 w-full rounded-xl border border-[#d4d2cc] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#121212] focus:ring-2 focus:ring-[#121212]/10"
                  value={xferRota}
                  onChange={(e) => setXferRota(e.target.value)}
                >
                  <option value="">-</option>
                  {rotas.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-4 block text-[13px] font-medium text-[#121212]">
                New owner
                <select
                  className="mt-1.5 w-full rounded-xl border border-[#d4d2cc] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#121212] focus:ring-2 focus:ring-[#121212]/10"
                  value={xferUser}
                  onChange={(e) => setXferUser(e.target.value)}
                >
                  <option value="">-</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className={`${BTN_PRIMARY} mt-5 w-full sm:w-auto`} onClick={() => void transfer()}>
                Transfer
              </button>
                    </div>
          ) : null}
          {rotas.length > 0 ? (
            <div className="rounded-xl border border-[#ebe9e4] bg-[#faf9f6] p-5 sm:col-span-2 sm:p-6">
              <h3 className="font-authSerif text-[17px] text-[#121212]">Draft or published</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-[#6b6b6b]">
                Draft rotas stay hidden from most staff until you publish. Notifications are not sent for draft rotas.
              </p>
              <ul className="mt-4 space-y-2">
                {rotas.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#d4d2cc] bg-white px-4 py-3 text-[13px]"
                  >
                    <span className="font-medium text-[#121212]">{r.title}</span>
                    <select
                      className="rounded-lg border border-[#d4d2cc] bg-[#faf9f6] px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-[#121212]/10"
                      value={r.status === 'draft' ? 'draft' : 'published'}
                      onChange={(e) =>
                        void setRotaStatus(r.id, e.target.value as 'draft' | 'published')
                      }
                    >
                      <option value="published">Published</option>
                      <option value="draft">Draft</option>
                    </select>
                  </li>
                ))}
              </ul>
                </div>
          ) : null}
          {msg ? (
            <p className="status-banner-error rounded-xl px-4 py-3 text-[13px] sm:col-span-2">
              {msg}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ShiftEditor({
  profile,
  departments,
  staff,
  managedDeptIds,
  rotas,
  requireRota,
  prefillAssigneeUserId,
  editingShift,
  slotPreset,
  availabilityTemplates,
  availabilityOverrides,
  onDismiss,
  onSaved,
  onRotasUpdated,
}: {
  profile: Profile;
  departments: { id: string; name: string }[];
  staff: StaffOption[];
  managedDeptIds: string[];
  rotas: RotaRow[];
  requireRota: boolean;
  /** When creating a shift from My schedule, default staff to this user so the row appears in that view. */
  prefillAssigneeUserId: string | null;
  editingShift: ShiftRow | null;
  slotPreset: { startLocal: string; endLocal: string } | null;
  availabilityTemplates: StaffAvailabilityTemplate[];
  availabilityOverrides: StaffAvailabilityOverride[];
  onDismiss: () => void;
  onSaved: () => void;
  onRotasUpdated: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [rotaId, setRotaId] = useState('');
  const [deptId, setDeptId] = useState('');
  const [userId, setUserId] = useState('');
  const [level, setLevel] = useState<'all' | 'csa' | 'dm'>('all');
  const [roleLabel, setRoleLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [startLocal, setStartLocal] = useState('');
  const [endLocal, setEndLocal] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [newRotaTitle, setNewRotaTitle] = useState('');
  const [newRotaKind, setNewRotaKind] = useState('shift');
  const [newRotaDept, setNewRotaDept] = useState('');
  const [busyStaffIds, setBusyStaffIds] = useState<Set<string>>(new Set());

  const isEdit = Boolean(editingShift);

  useEffect(() => {
    setMsg(null);
    if (editingShift) {
      setRotaId(editingShift.rota_id ?? '');
      setDeptId(editingShift.dept_id ?? '');
      setUserId(editingShift.user_id ?? '');
      setRoleLabel(editingShift.role_label ?? '');
      setNotes(editingShift.notes ?? '');
      setStartLocal(toDatetimeLocalValue(editingShift.start_time));
      setEndLocal(toDatetimeLocalValue(editingShift.end_time));
    } else if (slotPreset) {
      setRotaId('');
      setDeptId(profile.role === 'manager' && managedDeptIds.length === 1 ? managedDeptIds[0]! : '');
      setUserId(prefillAssigneeUserId ?? '');
      setRoleLabel('');
      setNotes('');
      setStartLocal(slotPreset.startLocal);
      setEndLocal(slotPreset.endLocal);
    } else {
      setRotaId('');
      setDeptId('');
      setUserId(prefillAssigneeUserId ?? '');
      setRoleLabel('');
      setNotes('');
      setStartLocal('');
      setEndLocal('');
    }
  }, [editingShift, slotPreset, profile.role, managedDeptIds, prefillAssigneeUserId]);

  const deptOptions =
    profile.role === 'manager'
      ? departments.filter((d) => managedDeptIds.includes(d.id))
      : departments;

  const roleLevel = useCallback((role: string): 'csa' | 'dm' | 'other' => {
    const r = (role || '').toLowerCase();
    if (r === 'duty_manager') return 'dm';
    if (r === 'administrator' || r === 'csa') return 'csa';
    return 'other';
  }, []);

  useEffect(() => {
    if (!startLocal || !endLocal) return;
    const start = new Date(startLocal);
    const end = new Date(endLocal);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return;
    let cancelled = false;
    void (async () => {
      let q = supabase
        .from('rota_shifts')
        .select('user_id')
        .eq('org_id', profile.org_id)
        .lt('start_time', end.toISOString())
        .gt('end_time', start.toISOString());
      if (editingShift) q = q.neq('id', editingShift.id);
      const { data } = await q;
      if (cancelled) return;
      setBusyStaffIds(new Set((data ?? []).map((r) => r.user_id as string).filter(Boolean)));
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, profile.org_id, startLocal, endLocal, editingShift]);

  const eligibleStaff = useMemo(() => {
    return staff.filter((s) => {
      if (deptId && !s.dept_ids.includes(deptId)) return false;
      if (level !== 'all' && roleLevel(s.role) !== level) return false;
      return !busyStaffIds.has(s.id);
    });
  }, [staff, deptId, level, roleLevel, busyStaffIds]);

  useEffect(() => {
    if (userId && !eligibleStaff.some((s) => s.id === userId)) setUserId('');
  }, [eligibleStaff, userId]);

  const assigneeHintById = useMemo(() => {
    if (!startLocal || !endLocal) return new Map<string, StaffAvailabilityHint>();
    const start = new Date(startLocal);
    const end = new Date(endLocal);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return new Map<string, StaffAvailabilityHint>();
    }
    const m = new Map<string, StaffAvailabilityHint>();
    for (const s of eligibleStaff) {
      m.set(
        s.id,
        staffAvailabilityHintForShift(s.id, start, end, availabilityTemplates, availabilityOverrides),
      );
    }
    return m;
  }, [startLocal, endLocal, eligibleStaff, availabilityTemplates, availabilityOverrides]);

  const fieldClass =
    'mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-sm text-[#121212] outline-none focus:border-[#121212] focus:ring-[3px] focus:ring-[#121212]/10';

  async function save() {
    setMsg(null);
    if (requireRota && !rotaId) {
      setMsg('Select a rota (coordinators must link shifts to a rota).');
      return;
    }
    if (!deptId && profile.role === 'manager') {
      setMsg('Department is required.');
      return;
    }
    if (!startLocal || !endLocal) {
      setMsg('Start and end time required.');
      return;
    }
    const start = new Date(startLocal);
    const end = new Date(endLocal);
    if (end <= start) {
      setMsg('End must be after start.');
      return;
    }
    const assignee = userId || null;
    if (assignee) {
      let q = supabase
        .from('rota_shifts')
        .select('id')
        .eq('org_id', profile.org_id)
        .eq('user_id', assignee)
        .lt('start_time', end.toISOString())
        .gt('end_time', start.toISOString())
        .limit(1);
      if (editingShift) {
        q = q.neq('id', editingShift.id);
      }
      const { data: overlap } = await q;
      if (overlap?.length) {
        const ok = window.confirm(
          'This person already has a shift overlapping this window. Save anyway?'
        );
        if (!ok) return;
      }
    }
    if (isEdit && editingShift) {
      const { error } = await supabase
        .from('rota_shifts')
        .update({
          rota_id: rotaId || null,
          dept_id: deptId || null,
          user_id: assignee,
          role_label: roleLabel || null,
          notes: notes || null,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
        })
        .eq('id', editingShift.id);
      if (error) {
        setMsg(friendlyDbError(error.message));
        return;
      }
      queueEntityCalendarSync({ type: 'shift', id: editingShift.id, action: 'upsert' });
    } else {
      const { data: newShift, error } = await supabase.from('rota_shifts').insert({
        org_id: profile.org_id,
        rota_id: rotaId || null,
        dept_id: deptId || null,
        user_id: assignee,
        role_label: roleLabel || null,
        notes: notes || null,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        source: 'manual',
      }).select('id').single();
      if (error) {
        setMsg(friendlyDbError(error.message));
        return;
      }
      if (newShift?.id) {
        queueEntityCalendarSync({ type: 'shift', id: newShift.id, action: 'upsert' });
      }
    }
    onDismiss();
    onSaved();
  }

  async function removeShift() {
    if (!editingShift) return;
    if (!window.confirm('Delete this shift? This cannot be undone.')) return;
    setMsg(null);
    // Sync deletion before removing from DB so providers can look up stored event ids.
    queueEntityCalendarSync({ type: 'shift', id: editingShift.id, action: 'delete' });
    const { error } = await supabase.from('rota_shifts').delete().eq('id', editingShift.id);
    if (error) {
      setMsg(friendlyDbError(error.message));
      return;
    }
    onDismiss();
    onSaved();
  }

  async function createRotaInline() {
    setMsg(null);
    if (profile.role === 'manager' && !newRotaDept) {
      setMsg('Pick a department for the new rota.');
      return;
    }
    const { data, error } = await supabase
      .from('rotas')
      .insert({
        org_id: profile.org_id,
        title: newRotaTitle.trim() || 'Rota',
        kind: newRotaKind,
        owner_id: profile.id,
        dept_id: newRotaDept || null,
        status: 'published',
        published_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error) {
      setMsg(friendlyDbError(error.message));
      return;
    }
    setRotaId((data as { id: string }).id);
    onRotasUpdated();
  }

  return (
    <div className="rounded-2xl border border-[#e4e2dc] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#ebe9e4] px-5 py-4 sm:px-6">
        <div>
          <h2 className="font-authSerif text-[18px] text-[#121212]">{isEdit ? 'Edit shift' : 'New shift'}</h2>
          {isEdit ? (
            <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-[#6b6b6b]">
              Managers and rota owners can adjust shifts here. Staff use <strong className="font-medium text-[#121212]">Requests &amp; swaps</strong> for their own assignments.
            </p>
          ) : (
            <p className="mt-1 max-w-xl text-[13px] text-[#6b6b6b]">
              Add this shift to the calendar for the selected week.
            </p>
          )}
        </div>
      <button
        type="button"
          className={`${BTN_SECONDARY} shrink-0`}
          onClick={() => onDismiss()}
      >
          Close
      </button>
      </div>
      <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 sm:px-6 sm:py-6">
          <label className="text-[13px] font-medium text-[#6b6b6b] sm:col-span-2">
            Rota {requireRota ? '(required)' : '(optional - link shifts to a named rota)'}
            <select className={fieldClass} value={rotaId} onChange={(e) => setRotaId(e.target.value)}>
              <option value="">-</option>
              {rotas.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} ({r.kind}){r.status === 'draft' ? ' - draft' : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-2 rounded-xl border border-dashed border-[#d4d2cc] bg-[#faf9f6] p-4 sm:p-5">
            <p className="text-[13px] font-semibold text-[#121212]">Need a new rota?</p>
            <p className="mt-1 text-[12.5px] text-[#6b6b6b]">
              {isEdit ? 'Finish editing this shift first, or use Roster setup to create rotas.' : 'Create one inline and it will be selected for this shift.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                className={fieldClass + ' max-w-[200px]'}
                placeholder="Title"
                value={newRotaTitle}
                onChange={(e) => setNewRotaTitle(e.target.value)}
                disabled={isEdit}
              />
              <select
                className={fieldClass + ' max-w-[140px]'}
                value={newRotaKind}
                onChange={(e) => setNewRotaKind(e.target.value)}
                disabled={isEdit}
              >
                <option value="shift">shift</option>
                <option value="activity">activity</option>
                <option value="reception">reception</option>
                <option value="other">other</option>
              </select>
              <select
                className={fieldClass + ' max-w-[160px]'}
                value={newRotaDept}
                onChange={(e) => setNewRotaDept(e.target.value)}
                disabled={isEdit}
              >
                <option value="">dept</option>
                {deptOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={`${BTN_SECONDARY} text-[12.5px] disabled:opacity-40`}
                onClick={() => void createRotaInline()}
                disabled={isEdit}
              >
                Create &amp; select
              </button>
            </div>
          </div>
          <label className="text-[13px] font-medium text-[#6b6b6b]">
            Department
            <select className={fieldClass} value={deptId} onChange={(e) => setDeptId(e.target.value)}>
              <option value="">-</option>
              {deptOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[13px] font-medium text-[#6b6b6b]">
            Level
            <select className={fieldClass} value={level} onChange={(e) => setLevel(e.target.value as 'all' | 'csa' | 'dm')}>
              <option value="all">All levels</option>
              <option value="csa">CSA</option>
              <option value="dm">DM</option>
            </select>
          </label>
          <label className="text-[13px] font-medium text-[#6b6b6b]">
            Assignee
            <select className={fieldClass} value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Open slot</option>
              {eligibleStaff.map((s) => {
                const hint = assigneeHintById.get(s.id);
                const hintLabel = hint ? ` — ${formatAvailabilityHint(hint)}` : '';
                return (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                    {hintLabel}
                  </option>
                );
              })}
            </select>
          </label>
          <label className="text-[13px] font-medium text-[#6b6b6b] sm:col-span-2">
            Role label
            <input className={fieldClass} value={roleLabel} onChange={(e) => setRoleLabel(e.target.value)} />
          </label>
          <label className="text-[13px] font-medium text-[#6b6b6b]">
            Start
            <input
              type="datetime-local"
              className={fieldClass}
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
            />
          </label>
          <label className="text-[13px] font-medium text-[#6b6b6b]">
            End
            <input
              type="datetime-local"
              className={fieldClass}
              value={endLocal}
              onChange={(e) => setEndLocal(e.target.value)}
            />
          </label>
          <label className="text-[13px] font-medium text-[#6b6b6b] sm:col-span-2">
            Notes
            <textarea className={fieldClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          {msg ? (
            <p className="status-banner-error rounded-xl px-4 py-3 text-[13px] sm:col-span-2">
              {msg}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <button type="button" className={BTN_PRIMARY} onClick={() => void save()}>
              {isEdit ? 'Save changes' : 'Save shift'}
            </button>
            <button type="button" className={BTN_SECONDARY} onClick={() => onDismiss()}>
              Cancel
            </button>
            {isEdit ? (
          <button
            type="button"
                className="rounded-xl border border-red-300 bg-white px-4 py-2.5 text-[13px] font-semibold text-red-800 transition hover:bg-red-50"
                onClick={() => void removeShift()}
          >
                Delete shift
          </button>
      ) : null}
          </div>
      </div>
    </div>
  );
}
