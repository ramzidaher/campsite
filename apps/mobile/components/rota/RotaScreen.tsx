import {
  canCreateRota,
  canEditRotaShifts,
  canFinalApproveRotaRequests,
  canViewRotaDepartmentScope,
  canViewRotaFullOrgGrid,
} from '@campsite/types';
import { useCampsiteTheme } from '@campsite/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';

import { TabSafeScreen } from '@/components/shell/TabSafeScreen';
import type { ProfileRow } from '@/lib/AuthContext';
import {
  addWeeks,
  endOfWeekExclusive,
  formatShiftTimeRange,
  startOfWeekMonday,
} from '@/lib/calendarDatetime';
import { loadMyCalendarBusyForRotaWeek } from '@/lib/rota/calendarBusyForRota';
import { friendlyDbError } from '@/lib/rota/friendlyDbError';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

import { RotaManagePanelMobile, RotaMembersPanelMobile } from './RotaSetupPanels';
import { RotaShiftEditorModal, type RotaRow, type ShiftRow } from './RotaShiftEditorModal';
import { RotaWeekGridMobile } from './RotaWeekGridMobile';

type ViewMode = 'my' | 'team' | 'full';
type PageSection = 'schedule' | 'requests' | 'setup';

function mapShiftRow(
  r: Record<string, unknown>,
  dm: Map<string, string>,
  sm: Map<string, string>
): ShiftRow {
  const deptId = (r.dept_id as string | null) ?? null;
  const uid = (r.user_id as string | null) ?? null;
  const rotRaw = r.rotas;
  const rot: ShiftRow['rotas'] =
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
}

const SHIFT_VARIANTS = [
  { bg: '#e7e5e4', border: '#d6d3d1', text: '#44403c' },
  { bg: '#dcfce7', border: '#bbf7d0', text: '#166534' },
  { bg: '#fff7ed', border: '#fed7aa', text: '#9a3412' },
  { bg: '#f3e8ff', border: '#e9d5ff', text: '#6d28d9' },
] as const;

function shiftVariant(key: string | null) {
  let h = 0;
  const s = key ?? '';
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return SHIFT_VARIANTS[h % 4]!;
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
    const month = weekStart.toLocaleString(undefined, { month: 'long' });
    return `${d1}-${d2} ${month} ${y1}`;
  }
  return `${weekStart.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

function shiftsTimeOverlap(a: ShiftRow, b: ShiftRow): boolean {
  if (!a.user_id || !b.user_id || a.user_id !== b.user_id) return false;
  const as = new Date(a.start_time).getTime();
  const ae = new Date(a.end_time).getTime();
  const bs = new Date(b.start_time).getTime();
  const be = new Date(b.end_time).getTime();
  return as < be && bs < ae;
}

function localeTimeZoneOpts(iana: string | null | undefined): Pick<Intl.DateTimeFormatOptions, 'timeZone'> {
  const z = iana?.trim();
  if (!z) return {};
  try {
    Intl.DateTimeFormat(undefined, { timeZone: z });
    return { timeZone: z };
  } catch {
    return {};
  }
}

const EMPTY_META_DEPTS: { id: string; name: string }[] = [];
const EMPTY_META_STAFF: { id: string; full_name: string }[] = [];
const EMPTY_META_ROTAS: RotaRow[] = [];
const EMPTY_MANAGED: string[] = [];
const EMPTY_SHIFTS: ShiftRow[] = [];

function shiftPickLabel(s: ShiftRow, orgTz: string | null | undefined): string {
  const o = localeTimeZoneOpts(orgTz);
  const t = new Date(s.start_time).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...o,
  });
  return `${t}${s.rotas?.title ? ` · ${s.rotas.title}` : ''}`;
}

export function RotaScreen({ profile }: { profile: ProfileRow }) {
  const { tokens } = useCampsiteTheme();
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date()));
  const [view, setView] = useState<ViewMode>('my');
  const [pageSection, setPageSection] = useState<PageSection>('schedule');
  const [listMode, setListMode] = useState(true);
  const [filterUser, setFilterUser] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [scheduleFiltersOpen, setScheduleFiltersOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<ShiftRow | null>(null);
  const [slotPreset, setSlotPreset] = useState<{ start: Date; end: Date } | null>(null);
  const [swapMine, setSwapMine] = useState('');
  const [swapOther, setSwapOther] = useState('');
  const [changeShift, setChangeShift] = useState('');
  const [changeNote, setChangeNote] = useState('');

  const canTeam = canViewRotaDepartmentScope(profile.role);
  const canFull = canViewRotaFullOrgGrid(profile.role);
  const canEdit = canEditRotaShifts(profile.role);
  const canApprove = canFinalApproveRotaRequests(profile.role);
  const showSetup = canCreateRota(profile.role) || canEdit;

  useEffect(() => {
    if (view === 'team' && !canTeam) setView('my');
    if (view === 'full' && !canFull) setView('my');
  }, [view, canTeam, canFull]);

  const from = weekStart.toISOString();
  const to = endOfWeekExclusive(weekStart).toISOString();

  const orgTzQuery = useQuery({
    queryKey: ['mobile-org-timezone', profile.org_id],
    enabled: Boolean(profile.org_id && isSupabaseConfigured()),
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('organisations')
        .select('timezone')
        .eq('id', profile.org_id!)
        .maybeSingle();
      if (error) throw error;
      return (data?.timezone as string | null) ?? null;
    },
  });

  const metaQuery = useQuery({
    queryKey: ['mobile-rota-meta', profile.org_id, profile.id],
    enabled: Boolean(profile.org_id && isSupabaseConfigured()),
    queryFn: async () => {
      const supabase = getSupabase();
      const [dm, deps, profs, rotaRows] = await Promise.all([
        supabase.from('dept_managers').select('dept_id').eq('user_id', profile.id),
        supabase.from('departments').select('id,name').eq('org_id', profile.org_id!),
        supabase.from('profiles').select('id,full_name').eq('org_id', profile.org_id!).eq('status', 'active'),
        supabase.from('rotas').select('id,title,kind,dept_id,status').eq('org_id', profile.org_id!).order('title'),
      ]);
      if (dm.error) throw dm.error;
      if (deps.error) throw deps.error;
      if (profs.error) throw profs.error;
      if (rotaRows.error) throw rotaRows.error;
      return {
        managedDeptIds: (dm.data ?? []).map((r) => r.dept_id as string),
        departments: (deps.data ?? []) as { id: string; name: string }[],
        staff: (profs.data ?? []) as { id: string; full_name: string }[],
        rotas: (rotaRows.data ?? []) as RotaRow[],
      };
    },
  });

  const meta = metaQuery.data;
  const managedDeptIds = meta?.managedDeptIds ?? EMPTY_MANAGED;
  const departments = meta?.departments ?? EMPTY_META_DEPTS;
  const staff = meta?.staff ?? EMPTY_META_STAFF;
  const rotas = meta?.rotas ?? EMPTY_META_ROTAS;
  const dm = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);
  const sm = useMemo(
    () => new Map(staff.map((s) => [s.id, s.full_name ?? '-'])),
    [staff],
  );

  const shiftsQuery = useQuery({
    queryKey: [
      'mobile-rota-shifts-v2',
      profile.org_id,
      profile.id,
      view,
      from,
      to,
      managedDeptIds.join(','),
    ],
    enabled: Boolean(
      profile.org_id &&
        isSupabaseConfigured() &&
        metaQuery.isSuccess &&
        !(view === 'team' && profile.role === 'manager' && managedDeptIds.length === 0)
    ),
    queryFn: async () => {
      const supabase = getSupabase();
      let q = supabase
        .from('rota_shifts')
        .select('id, dept_id, rota_id, user_id, role_label, start_time, end_time, notes, source, rotas(id,title,kind)')
        .eq('org_id', profile.org_id!)
        .gte('start_time', from)
        .lt('start_time', to)
        .order('start_time');

      if (view === 'my') {
        q = q.eq('user_id', profile.id);
      } else if (view === 'team' && profile.role === 'manager') {
        q = q.in('dept_id', managedDeptIds);
      }

      const { data, error } = await q;
      if (error) throw error;
      let rows = (data ?? []).map((r) => mapShiftRow(r as Record<string, unknown>, dm, sm));
      if (filterUser) rows = rows.filter((r) => r.user_id === filterUser);
      if (filterDept) rows = rows.filter((r) => r.dept_id === filterDept);
      return rows;
    },
  });

  const calendarBusyQuery = useQuery({
    queryKey: ['mobile-rota-calendar-busy', profile.org_id, profile.id, from, to],
    enabled: Boolean(
      profile.org_id && isSupabaseConfigured() && metaQuery.isSuccess && view === 'my',
    ),
    queryFn: async () => {
      const supabase = getSupabase();
      return loadMyCalendarBusyForRotaWeek(supabase, {
        orgId: profile.org_id!,
        profileId: profile.id,
        fromIso: from,
        toIso: to,
      });
    },
  });

  const visibleShiftsQuery = useQuery({
    queryKey: ['mobile-rota-visible-week', profile.org_id, from, to],
    enabled: Boolean(profile.org_id && isSupabaseConfigured()),
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('rota_shifts')
        .select('id,user_id,role_label,start_time,end_time,rotas(title)')
        .eq('org_id', profile.org_id!)
        .gte('start_time', from)
        .lt('start_time', to)
        .order('start_time');
      if (error) throw error;
      const emptyDm = new Map<string, string>();
      const emptySm = new Map<string, string>();
      return (data ?? []).map((r) => {
        const row = r as Record<string, unknown>;
        const rot = row.rotas;
        let rotas: ShiftRow['rotas'] = null;
        if (rot != null) {
          if (Array.isArray(rot)) {
            const f = rot[0] as { title?: string } | undefined;
            rotas = f?.title ? { id: '', title: f.title, kind: '' } : null;
          } else {
            const o = rot as { title: string };
            rotas = { id: '', title: o.title, kind: '' };
          }
        }
        return mapShiftRow(
          {
            ...row,
            dept_id: null,
            rota_id: null,
            notes: null,
            source: '',
            rotas: rotas ? { id: '', title: rotas.title, kind: rotas.kind } : null,
          },
          emptyDm,
          emptySm,
        );
      });
    },
  });

  const requestsQuery = useQuery({
    queryKey: ['mobile-rota-requests', profile.org_id],
    enabled: Boolean(profile.org_id && isSupabaseConfigured()),
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('rota_change_requests')
        .select('id,request_type,status,created_at,counterparty_user_id')
        .eq('org_id', profile.org_id!)
        .order('created_at', { ascending: false })
        .limit(40);
      if (error) throw error;
      return data ?? [];
    },
  });

  const shifts = shiftsQuery.data ?? EMPTY_SHIFTS;
  const calendarBusy = calendarBusyQuery.data ?? [];
  const orgTz = orgTzQuery.data ?? null;

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
        if (shiftsTimeOverlap(shifts[i]!, shifts[j]!)) {
          s.add(shifts[i]!.id);
          s.add(shifts[j]!.id);
        }
      }
    }
    return s;
  }, [shifts]);

  const mySwapShifts = useMemo(
    () => (visibleShiftsQuery.data ?? []).filter((s) => s.user_id === profile.id),
    [visibleShiftsQuery.data, profile.id],
  );
  const otherSwapShifts = useMemo(
    () => (visibleShiftsQuery.data ?? []).filter((s) => s.user_id && s.user_id !== profile.id),
    [visibleShiftsQuery.data, profile.id],
  );

  const invalidateShifts = () => {
    void qc.invalidateQueries({ queryKey: ['mobile-rota-shifts-v2'] });
    void qc.invalidateQueries({ queryKey: ['mobile-rota-visible-week'] });
    void qc.invalidateQueries({ queryKey: ['mobile-rota-calendar-busy'] });
  };

  const loadRef = useRef(invalidateShifts);
  loadRef.current = invalidateShifts;

  useEffect(() => {
    if (!profile.org_id || !isSupabaseConfigured()) return;
    const supabase = getSupabase();
    const ch = supabase
      .channel(`rota-shifts-cal-mobile-${profile.org_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rota_shifts',
          filter: `org_id=eq.${profile.org_id}`,
        },
        () => loadRef.current(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'calendar_events',
          filter: `org_id=eq.${profile.org_id}`,
        },
        () => loadRef.current(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'calendar_event_attendees',
          filter: `org_id=eq.${profile.org_id}`,
        },
        () => loadRef.current(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [profile.org_id]);

  const claimMut = useMutation({
    mutationFn: async (shiftId: string) => {
      const supabase = getSupabase();
      const { error } = await supabase.rpc('rota_claim_open_shift', { p_shift_id: shiftId });
      if (error) throw new Error(friendlyDbError(error.message));
    },
    onSuccess: () => {
      invalidateShifts();
      void requestsQuery.refetch();
    },
  });

  const approveMut = useMutation({
    mutationFn: async (requestId: string) => {
      const supabase = getSupabase();
      const { error } = await supabase.rpc('rota_change_request_final_approve', { p_request_id: requestId });
      if (error) throw new Error(friendlyDbError(error.message));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mobile-rota-requests'] });
      invalidateShifts();
    },
  });

  const peerAcceptMut = useMutation({
    mutationFn: async (requestId: string) => {
      const supabase = getSupabase();
      const { error } = await supabase.rpc('rota_change_request_peer_accept', { p_request_id: requestId });
      if (error) throw new Error(friendlyDbError(error.message));
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['mobile-rota-requests'] }),
  });

  const submitSwapMut = useMutation({
    mutationFn: async () => {
      const supabase = getSupabase();
      const { error } = await supabase.rpc('rota_change_request_submit_swap', {
        p_primary_shift_id: swapMine,
        p_counterparty_shift_id: swapOther,
      });
      if (error) throw new Error(friendlyDbError(error.message));
    },
    onSuccess: () => {
      setSwapMine('');
      setSwapOther('');
      void qc.invalidateQueries({ queryKey: ['mobile-rota-requests'] });
      void visibleShiftsQuery.refetch();
      Alert.alert('Sent', 'Swap request submitted.');
    },
  });

  const submitChangeMut = useMutation({
    mutationFn: async () => {
      const supabase = getSupabase();
      const { error } = await supabase.rpc('rota_change_request_submit_change', {
        p_shift_id: changeShift,
        p_note: changeNote.trim() || null,
      });
      if (error) throw new Error(friendlyDbError(error.message));
    },
    onSuccess: () => {
      setChangeNote('');
      void qc.invalidateQueries({ queryKey: ['mobile-rota-requests'] });
      void visibleShiftsQuery.refetch();
      Alert.alert('Sent', 'Change request submitted.');
    },
  });

  function shiftTitleLines(s: ShiftRow): { time: string; primary: string; secondary: string | null } {
    const time = formatShiftTimeRange(s.start_time, s.end_time, orgTz);
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

  /** Grid cells are narrow: time on the first line, one short context line (details in list / editor). */
  function shiftGridLabel(s: ShiftRow): { primary: string; secondary: string | null } {
    const time = formatShiftTimeRange(s.start_time, s.end_time, orgTz);
    const rotaBit = s.rotas?.title ? s.rotas.title : null;
    if (view === 'my') {
      const line2 = rotaBit ?? s.departments?.name ?? 'Shift';
      return { primary: time, secondary: line2 };
    }
    const who = s.assignee?.full_name ?? 'Open';
    const bits = [rotaBit, s.departments?.name].filter(Boolean);
    const line2 = bits.length ? `${who} · ${bits.join(' · ')}` : who;
    return { primary: time, secondary: line2 };
  }

  function openEditShift(s: ShiftRow) {
    setEditingShift(s);
    setSlotPreset(null);
    setEditorOpen(true);
  }

  function openNewShift(preset?: { start: Date; end: Date }) {
    setEditingShift(null);
    setSlotPreset(preset ?? null);
    setEditorOpen(true);
  }

  function handleGridSlot({ dayIndex, startMinutesFromMidnight }: { dayIndex: number; startMinutesFromMidnight: number }) {
    const d = days[dayIndex];
    if (!d || !canEdit) return;
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const h = Math.floor(startMinutesFromMidnight / 60);
    const mi = startMinutesFromMidnight % 60;
    start.setHours(h, mi, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    openNewShift({ start, end });
  }

  const pendingFinal = (requestsQuery.data ?? []).filter((r: { status: string }) => r.status === 'pending_final');
  const pendingPeer = (requestsQuery.data ?? []).filter(
    (r: { status: string; counterparty_user_id: string | null }) =>
      r.status === 'pending_peer' && r.counterparty_user_id === profile.id,
  );

  const loading =
    shiftsQuery.isPending ||
    metaQuery.isPending ||
    (view === 'team' && profile.role === 'manager' && metaQuery.isPending) ||
    (view === 'my' && calendarBusyQuery.isPending);

  const scopeSegments = [
    { mode: 'my' as const, label: 'Mine', show: true },
    { mode: 'team' as const, label: 'Team', show: canTeam },
    { mode: 'full' as const, label: 'Everyone', show: canFull },
  ].filter((x) => x.show);

  const filterActiveCount = (filterUser ? 1 : 0) + (filterDept ? 1 : 0);
  const filterUserName = filterUser ? (sm.get(filterUser) ?? 'Staff') : null;
  const filterDeptName = filterDept ? (dm.get(filterDept) ?? 'Dept') : null;

  if (!profile.org_id) {
    return (
      <TabSafeScreen>
        <View style={[styles.center, { backgroundColor: tokens.background }]}>
          <Text style={{ color: tokens.textSecondary }}>Sign in to view your rota.</Text>
        </View>
      </TabSafeScreen>
    );
  }

  return (
    <TabSafeScreen>
      <ScrollView
        style={{ flex: 1, backgroundColor: tokens.background }}
        contentContainerStyle={styles.scrollPad}
        refreshControl={
          <RefreshControl
            refreshing={
              shiftsQuery.isRefetching ||
              metaQuery.isRefetching ||
              requestsQuery.isRefetching ||
              visibleShiftsQuery.isRefetching ||
              orgTzQuery.isRefetching ||
              calendarBusyQuery.isRefetching
            }
            onRefresh={() => {
              void shiftsQuery.refetch();
              void metaQuery.refetch();
              void requestsQuery.refetch();
              void visibleShiftsQuery.refetch();
              void orgTzQuery.refetch();
              void calendarBusyQuery.refetch();
            }}
            tintColor={tokens.textPrimary}
            colors={[tokens.textPrimary]}
          />
        }
      >
        <View style={styles.sectionTabs}>
          {(
            [
              { id: 'schedule' as const, label: 'Schedule' },
              { id: 'requests' as const, label: 'Requests' },
              ...(showSetup ? [{ id: 'setup' as const, label: 'Rotas' }] : []),
            ] as const
          ).map((s) => (
            <Pressable
              key={s.id}
              onPress={() => setPageSection(s.id)}
              style={[
                styles.sectionTab,
                pageSection === s.id && { backgroundColor: tokens.textPrimary, borderColor: tokens.textPrimary },
              ]}
            >
              <Text
                style={[
                  styles.sectionTabText,
                  { color: pageSection === s.id ? tokens.background : tokens.textPrimary },
                ]}
                numberOfLines={1}
              >
                {s.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {pageSection === 'schedule' ? (
          <View style={[styles.card, { borderColor: tokens.border, backgroundColor: tokens.surface }]}>
            <View style={styles.tabs}>
              {scopeSegments.map(({ mode, label }) => (
                <Pressable
                  key={mode}
                  onPress={() => setView(mode)}
                  style={[
                    styles.tab,
                    view === mode && { backgroundColor: tokens.textPrimary, borderColor: tokens.textPrimary },
                  ]}
                >
                  <Text
                    style={[
                      styles.tabText,
                      { color: view === mode ? tokens.background : tokens.textPrimary },
                    ]}
                    numberOfLines={2}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.weekNav}>
              <Pressable style={[styles.navBtn, { borderColor: tokens.border }]} onPress={() => setWeekStart((w) => addWeeks(w, -1))}>
                <Text>‹</Text>
              </Pressable>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={[styles.weekRange, { color: tokens.textPrimary }]}>{formatWeekRange(weekStart)}</Text>
                <Pressable onPress={() => setWeekStart(startOfWeekMonday(new Date()))}>
                  <Text style={{ color: tokens.textSecondary, fontSize: 12, textDecorationLine: 'underline' }}>This week</Text>
                </Pressable>
              </View>
              <Pressable style={[styles.navBtn, { borderColor: tokens.border }]} onPress={() => setWeekStart((w) => addWeeks(w, 1))}>
                <Text>›</Text>
              </Pressable>
            </View>

            <View style={styles.listGridToggle}>
              <Pressable
                onPress={() => setListMode(true)}
                style={[
                  styles.lgBtn,
                  listMode && { backgroundColor: tokens.textPrimary },
                  { borderColor: tokens.border },
                ]}
              >
                <Text style={{ fontWeight: '600', color: listMode ? tokens.background : tokens.textSecondary }}>List</Text>
              </Pressable>
              <Pressable
                onPress={() => setListMode(false)}
                style={[
                  styles.lgBtn,
                  !listMode && { backgroundColor: tokens.textPrimary },
                  { borderColor: tokens.border },
                ]}
              >
                <Text style={{ fontWeight: '600', color: !listMode ? tokens.background : tokens.textSecondary }}>Week grid</Text>
              </Pressable>
            </View>

            {(view === 'team' || view === 'full') && (
              <View style={{ marginTop: 12 }}>
                <Pressable
                  onPress={() => setScheduleFiltersOpen((o) => !o)}
                  style={[styles.filterToggleRow, { borderColor: tokens.border, backgroundColor: tokens.surface }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.filterToggleTitle, { color: tokens.textPrimary }]}>Filters</Text>
                    {!scheduleFiltersOpen && filterActiveCount > 0 ? (
                      <Text style={[styles.filterToggleSummary, { color: tokens.textSecondary }]} numberOfLines={2}>
                        {[filterUserName, filterDeptName].filter(Boolean).join(' · ')}
                      </Text>
                    ) : !scheduleFiltersOpen ? (
                      <Text style={[styles.filterToggleSummary, { color: tokens.textSecondary }]}>All staff</Text>
                    ) : null}
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: tokens.textSecondary }}>
                    {scheduleFiltersOpen ? 'Hide' : filterActiveCount ? `${filterActiveCount} active` : 'Show'}
                  </Text>
                </Pressable>
                {scheduleFiltersOpen ? (
                  <View style={{ marginTop: 10, gap: 8 }}>
                    <Text style={{ fontSize: 12, color: tokens.textSecondary }}>Staff</Text>
                    <View style={[styles.pickerWrap, { borderColor: tokens.border }]}>
                      <Picker selectedValue={filterUser} onValueChange={setFilterUser}>
                        <Picker.Item label="All" value="" />
                        {staff.map((s) => (
                          <Picker.Item key={s.id} label={s.full_name} value={s.id} />
                        ))}
                      </Picker>
                    </View>
                    {view === 'full' ? (
                      <>
                        <Text style={{ fontSize: 12, color: tokens.textSecondary }}>Department</Text>
                        <View style={[styles.pickerWrap, { borderColor: tokens.border }]}>
                          <Picker selectedValue={filterDept} onValueChange={setFilterDept}>
                            <Picker.Item label="All" value="" />
                            {departments.map((d) => (
                              <Picker.Item key={d.id} label={d.name} value={d.id} />
                            ))}
                          </Picker>
                        </View>
                      </>
                    ) : null}
                  </View>
                ) : null}
              </View>
            )}

            {view === 'team' && profile.role === 'manager' && managedDeptIds.length === 0 ? (
              <Text style={[styles.empty, { color: tokens.textSecondary }]}>
                No managed departments  team view is empty.
              </Text>
            ) : loading ? (
              <ActivityIndicator style={{ marginTop: 24 }} color={tokens.textPrimary} />
            ) : listMode ? (
              shifts.length === 0 && calendarBusy.length === 0 ? (
                <Text style={[styles.empty, { color: tokens.textSecondary }]}>No shifts this week.</Text>
              ) : (
                <>
                  {shifts.map((s) => {
                    const v = shiftVariant(s.dept_id ?? s.id);
                    const { time, primary, secondary } = shiftTitleLines(s);
                    const openSlot = s.user_id === null;
                    const showClaim = openSlot;
                    const showEdit = canEdit;
                    const showFooter = showClaim || showEdit;
                    return (
                      <View
                        key={s.id}
                        style={[
                          styles.listCardShell,
                          styles.listCardElevated,
                          { backgroundColor: tokens.surface },
                        ]}
                      >
                        <View style={[styles.listCardAccent, { backgroundColor: v.border }]} />
                        <View style={styles.listCardBody}>
                          <Text style={[styles.listTime, { color: v.text }]}>{time}</Text>
                          <View style={styles.listTitleRow}>
                            <Text style={[styles.listTitle, { color: tokens.textPrimary }]} numberOfLines={2}>
                              {primary}
                            </Text>
                            {overlapShiftIds.has(s.id) ? (
                              <View style={styles.overlapChip}>
                                <Text style={styles.overlapChipText}>Overlap</Text>
                              </View>
                            ) : null}
                          </View>
                          {secondary ? (
                            <Text
                              style={[styles.listMeta, { color: tokens.textSecondary }]}
                              numberOfLines={2}
                            >
                              {secondary}
                            </Text>
                          ) : null}
                          {showFooter ? (
                            <View style={[styles.listFooter, { borderTopColor: tokens.border }]}>
                              <View style={styles.listFooterLeft}>
                                {showClaim ? (
                                  <Pressable
                                    style={({ pressed }) => [
                                      styles.listClaimBtn,
                                      pressed && styles.listClaimBtnPressed,
                                    ]}
                                    onPress={() =>
                                      claimMut.mutate(s.id, {
                                        onError: (e: Error) => Alert.alert('Could not claim', e.message),
                                      })
                                    }
                                  >
                                    <Ionicons name="hand-left-outline" size={17} color="#fff" />
                                    <Text style={styles.listClaimBtnText}>Claim slot</Text>
                                  </Pressable>
                                ) : null}
                              </View>
                              {showEdit ? (
                                <Pressable
                                  style={({ pressed }) => [
                                    styles.listEditBtn,
                                    pressed && { opacity: 0.65 },
                                  ]}
                                  onPress={() => openEditShift(s)}
                                  hitSlop={10}
                                >
                                  <Ionicons name="create-outline" size={20} color={tokens.textPrimary} />
                                  <Text style={[styles.listEditBtnText, { color: tokens.textPrimary }]}>Edit</Text>
                                </Pressable>
                              ) : null}
                            </View>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                  {view === 'my' && calendarBusy.length > 0
                    ? calendarBusy.map((c) => (
                        <View
                          key={`cal-${c.id}`}
                          style={[
                            styles.listCardShell,
                            styles.listCardElevated,
                            { backgroundColor: '#f5f3ff', borderColor: '#ddd6fe', borderWidth: 1 },
                          ]}
                        >
                          <View style={[styles.listCardAccent, { backgroundColor: '#a78bfa' }]} />
                          <View style={styles.listCardBody}>
                            <Text style={[styles.listTime, { color: '#5b21b6' }]}>
                              {formatShiftTimeRange(c.start_time, c.end_time, orgTz)}
                            </Text>
                            <Text style={[styles.listTitle, { color: tokens.textPrimary }]} numberOfLines={2}>
                              {c.title}
                            </Text>
                            <Text style={[styles.listMeta, { color: tokens.textSecondary }]}>Org calendar (not a shift)</Text>
                          </View>
                        </View>
                      ))
                    : null}
                </>
              )
            ) : (
              <View style={{ marginTop: 16 }}>
                {shifts.length === 0 && calendarBusy.length === 0 ? (
                  <Text style={[styles.empty, { color: tokens.textSecondary, marginBottom: 12 }]}>
                    No shifts this week. {canEdit ? 'Tap the grid or use Add shift.' : ''}
                  </Text>
                ) : null}
                <RotaWeekGridMobile
                  days={days}
                  shifts={shifts}
                  shiftVariant={shiftVariant}
                  shiftLabel={shiftGridLabel}
                  overlapShiftIds={overlapShiftIds}
                  canEdit={canEdit}
                  onShiftPress={openEditShift}
                  onBackgroundSlotPress={canEdit ? handleGridSlot : undefined}
                  calendarBusyBlocks={view === 'my' ? calendarBusy : undefined}
                />
              </View>
            )}

            {canEdit ? (
              <Pressable
                style={[styles.addShiftBtn, { backgroundColor: tokens.textPrimary }]}
                onPress={() => openNewShift()}
              >
                <Text style={{ color: tokens.background, fontWeight: '600' }}>Add shift</Text>
              </Pressable>
            ) : null}
          </View>
        ) : pageSection === 'requests' ? (
          <View>
            <Text style={[styles.cardLabel, { color: tokens.textSecondary, marginBottom: 8 }]}>New requests</Text>
            <Text style={[styles.hint, { color: tokens.textSecondary }]}>
              Swap shifts or ask to be unassigned (same flow as web).
            </Text>
            <Text style={[styles.label, { color: tokens.textSecondary }]}>Your shift</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
              {mySwapShifts.map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => setSwapMine(s.id)}
                  style={[
                    styles.chip,
                    { borderColor: tokens.border, backgroundColor: tokens.surface },
                    swapMine === s.id && { borderColor: tokens.textPrimary, borderWidth: 2 },
                  ]}
                >
                  <Text style={{ fontSize: 12, color: tokens.textPrimary }}>{shiftPickLabel(s, orgTz)}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={[styles.label, { color: tokens.textSecondary, marginTop: 10 }]}>Their shift</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
              {otherSwapShifts.map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => setSwapOther(s.id)}
                  style={[
                    styles.chip,
                    { borderColor: tokens.border, backgroundColor: tokens.surface },
                    swapOther === s.id && { borderColor: tokens.textPrimary, borderWidth: 2 },
                  ]}
                >
                  <Text style={{ fontSize: 12, color: tokens.textPrimary }}>{shiftPickLabel(s, orgTz)}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              style={[styles.btn, { borderColor: tokens.border, marginTop: 10 }]}
              onPress={() => {
                if (!swapMine || !swapOther) {
                  Alert.alert('Pick both shifts', 'Select your shift and their shift.');
                  return;
                }
                submitSwapMut.mutate(undefined, {
                  onError: (e: Error) => Alert.alert('Swap failed', e.message),
                });
              }}
            >
              <Text style={{ color: tokens.textPrimary }}>Submit swap request</Text>
            </Pressable>

            <Text style={[styles.label, { color: tokens.textSecondary, marginTop: 16 }]}>Request unassign</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
              {mySwapShifts.map((s) => (
                <Pressable
                  key={`c-${s.id}`}
                  onPress={() => setChangeShift(s.id)}
                  style={[
                    styles.chip,
                    { borderColor: tokens.border, backgroundColor: tokens.surface },
                    changeShift === s.id && { borderColor: tokens.textPrimary, borderWidth: 2 },
                  ]}
                >
                  <Text style={{ fontSize: 12, color: tokens.textPrimary }}>{shiftPickLabel(s, orgTz)}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <TextInput
              style={[styles.input, { borderColor: tokens.border, color: tokens.textPrimary, marginTop: 8 }]}
              placeholder="Note to approvers (optional)"
              placeholderTextColor={tokens.textMuted}
              value={changeNote}
              onChangeText={setChangeNote}
              multiline
            />
            <Pressable
              style={[styles.btn, { borderColor: tokens.border, marginTop: 8 }]}
              onPress={() => {
                if (!changeShift) {
                  Alert.alert('Pick a shift', 'Select one of your shifts.');
                  return;
                }
                submitChangeMut.mutate(undefined, {
                  onError: (e: Error) => Alert.alert('Request failed', e.message),
                });
              }}
            >
              <Text style={{ color: tokens.textPrimary }}>Submit unassign request</Text>
            </Pressable>

            {pendingPeer.length > 0 ? (
              <View style={{ marginTop: 24 }}>
                <Text style={[styles.section, { color: tokens.textPrimary }]}>Swap  your OK</Text>
                {pendingPeer.map((r: { id: string }) => (
                  <Pressable
                    key={r.id}
                    style={[styles.btn, { borderColor: tokens.border, marginTop: 8 }]}
                    onPress={() =>
                      peerAcceptMut.mutate(r.id, {
                        onError: (e: Error) => Alert.alert('Error', e.message),
                      })
                    }
                  >
                    <Text style={{ color: tokens.textPrimary }}>Accept swap</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {canApprove && pendingFinal.length > 0 ? (
              <View style={{ marginTop: 24 }}>
                <Text style={[styles.section, { color: tokens.textPrimary }]}>Awaiting approval</Text>
                {pendingFinal.map((r: { id: string; request_type: string }) => (
                  <View
                    key={r.id}
                    style={[styles.card, { borderColor: tokens.border, backgroundColor: tokens.surface, marginTop: 8 }]}
                  >
                    <Text style={{ color: tokens.textPrimary }}>{r.request_type}</Text>
                    <Pressable
                      style={[styles.btn, { borderColor: '#047857', marginTop: 8 }]}
                      onPress={() =>
                        approveMut.mutate(r.id, {
                          onError: (e: Error) => Alert.alert('Error', e.message),
                        })
                      }
                    >
                      <Text style={{ color: '#047857' }}>Approve</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <View>
            <Text style={[styles.hint, { color: tokens.textSecondary, marginBottom: 16 }]}>
              Create rotas, publish or draft them, transfer ownership, and choose who is invited. Place shifts on the
              Schedule tab with Add shift.
            </Text>
            {canCreateRota(profile.role) ? (
              <RotaManagePanelMobile
                profile={profile}
                departments={departments}
                managedDeptIds={managedDeptIds}
                rotas={rotas}
                onRotasChange={(next) => {
                  void qc.setQueryData(['mobile-rota-meta', profile.org_id, profile.id], (old: typeof metaQuery.data) =>
                    old ? { ...old, rotas: next } : old,
                  );
                }}
              />
            ) : null}
            {canEdit ? (
              <RotaMembersPanelMobile rotas={rotas.map((r) => ({ id: r.id, title: r.title }))} staff={staff} />
            ) : null}
          </View>
        )}
      </ScrollView>

      <RotaShiftEditorModal
        visible={editorOpen}
        profile={profile}
        departments={departments}
        staff={staff}
        managedDeptIds={managedDeptIds}
        rotas={rotas}
        requireRota={profile.role === 'coordinator'}
        prefillAssigneeUserId={view === 'my' ? profile.id : null}
        editingShift={editingShift}
        slotPreset={slotPreset}
        onClose={() => {
          setEditorOpen(false);
          setEditingShift(null);
          setSlotPreset(null);
        }}
        onSaved={() => {
          invalidateShifts();
          void metaQuery.refetch();
        }}
        onRotasUpdated={() => void metaQuery.refetch()}
      />
    </TabSafeScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  scrollPad: { padding: 20, paddingBottom: 48 },
  sectionTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  sectionTab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d4d2cc',
    backgroundColor: '#f3f2ee',
  },
  sectionTabText: { fontSize: 12, fontWeight: '600' },
  card: { marginTop: 16, borderRadius: 12, borderWidth: 1, padding: 16 },
  cardLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d8d8d8',
    flex: 1,
    minWidth: '30%',
  },
  tabText: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  weekNav: { flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 8 },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekRange: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  listGridToggle: { flexDirection: 'row', marginTop: 14, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#d4d2cc' },
  lgBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff' },
  filterToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  filterToggleTitle: { fontSize: 14, fontWeight: '600' },
  filterToggleSummary: { fontSize: 12, marginTop: 2 },
  pickerWrap: { borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  empty: { marginTop: 16, fontSize: 14 },
  listCardShell: {
    flexDirection: 'row',
    marginTop: 10,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'stretch',
  },
  listCardElevated:
    Platform.OS === 'ios'
      ? {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.07,
          shadowRadius: 10,
        }
      : Platform.OS === 'android'
        ? { elevation: 3 }
        : {},
  listCardAccent: { width: 5 },
  listCardBody: { flex: 1, paddingVertical: 14, paddingRight: 14, paddingLeft: 12 },
  listTime: { fontSize: 13, fontWeight: '700', letterSpacing: -0.2, opacity: 0.95 },
  listTitleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 8 },
  listTitle: { fontSize: 17, fontWeight: '600', letterSpacing: -0.3, flex: 1, minWidth: 0 },
  listMeta: { fontSize: 13, lineHeight: 18, marginTop: 6 },
  listFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  listFooterLeft: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  listClaimBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#15803d',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  listClaimBtnPressed: { opacity: 0.88 },
  listClaimBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  listEditBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 4 },
  listEditBtnText: { fontSize: 15, fontWeight: '600' },
  overlapChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#fef3c7',
  },
  overlapChipText: { fontSize: 10, fontWeight: '800', color: '#92400e', letterSpacing: 0.2 },
  addShiftBtn: { marginTop: 16, padding: 14, borderRadius: 10, alignItems: 'center' },
  hint: { fontSize: 14, lineHeight: 20 },
  label: { fontSize: 12, marginTop: 8 },
  chip: {
    marginRight: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 220,
  },
  btn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    minHeight: 44,
  },
  section: { fontSize: 16, fontWeight: '600' },
});
