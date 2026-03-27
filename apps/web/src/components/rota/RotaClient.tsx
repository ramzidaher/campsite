'use client';

import {
  canEditRotaShifts,
  canViewRotaDepartmentScope,
  canViewRotaFullOrgGrid,
  type ProfileRole,
} from '@campsite/types';
import { createClient } from '@/lib/supabase/client';
import { addWeeks, endOfWeekExclusive, startOfWeekMonday } from '@/lib/datetime';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Profile = { id: string; org_id: string; role: ProfileRole; full_name: string };

type ShiftRow = {
  id: string;
  dept_id: string | null;
  user_id: string | null;
  role_label: string | null;
  start_time: string;
  end_time: string;
  notes: string | null;
  source: string;
  departments: { name: string } | null;
  assignee: { full_name: string } | null;
};

type ViewMode = 'my' | 'team' | 'full';

const TIME_LABELS = [
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
];

const SHIFT_VARIANTS = [
  {
    bg: 'bg-[#dbeafe]',
    border: 'border-[#bfdbfe]',
    text: 'text-[#1e40af]',
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
    const month = weekStart.toLocaleString(undefined, { month: 'long' });
    return `${d1}–${d2} ${month} ${y1}`;
  }
  return `${weekStart.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

function isToday(d: Date): boolean {
  const t = new Date();
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
  );
}

const NAV_BTN =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#d8d8d8] bg-white text-sm text-[#6b6b6b] transition-colors hover:bg-[#f5f4f1]';

export function RotaClient({ profile }: { profile: Profile }) {
  const supabase = useMemo(() => createClient(), []);
  const editorRef = useRef<HTMLDivElement>(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date()));
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [managedDeptIds, setManagedDeptIds] = useState<string[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [staff, setStaff] = useState<{ id: string; full_name: string }[]>([]);
  const [view, setView] = useState<ViewMode>('my');
  const [listMode, setListMode] = useState(false);
  const [filterUser, setFilterUser] = useState<string>('');
  const [filterDept, setFilterDept] = useState<string>('');
  const [shiftEditorOpen, setShiftEditorOpen] = useState(false);

  const canTeam = canViewRotaDepartmentScope(profile.role);
  const canFull = canViewRotaFullOrgGrid(profile.role);
  const canEdit = canEditRotaShifts(profile.role);

  useEffect(() => {
    void (async () => {
      const [{ data: dm }, { data: deps }, { data: profs }] = await Promise.all([
        supabase.from('dept_managers').select('dept_id').eq('user_id', profile.id),
        supabase.from('departments').select('id,name').eq('org_id', profile.org_id),
        supabase.from('profiles').select('id,full_name').eq('org_id', profile.org_id).eq('status', 'active'),
      ]);
      setManagedDeptIds((dm ?? []).map((r) => r.dept_id as string));
      setDepartments((deps ?? []) as { id: string; name: string }[]);
      setStaff((profs ?? []) as { id: string; full_name: string }[]);
    })();
  }, [supabase, profile.id, profile.org_id]);

  useEffect(() => {
    if (view === 'team' && !canTeam) setView('my');
    if (view === 'full' && !canFull) setView('my');
  }, [view, canTeam, canFull]);

  const load = useCallback(async () => {
    setLoading(true);
    const from = weekStart.toISOString();
    const to = endOfWeekExclusive(weekStart).toISOString();

    const dm = new Map(departments.map((d) => [d.id, d.name]));
    const sm = new Map(staff.map((s) => [s.id, s.full_name]));

    let q = supabase
      .from('rota_shifts')
      .select('id, dept_id, user_id, role_label, start_time, end_time, notes, source')
      .eq('org_id', profile.org_id)
      .gte('start_time', from)
      .lt('start_time', to)
      .order('start_time');

    if (view === 'my') {
      q = q.eq('user_id', profile.id);
    } else if (view === 'team' && profile.role === 'manager') {
      if (!managedDeptIds.length) {
        setShifts([]);
        setLoading(false);
        return;
      }
      q = q.in('dept_id', managedDeptIds);
    }

    const { data, error } = await q;
    if (error) {
      console.error(error);
      setShifts([]);
    } else {
      let rows: ShiftRow[] = (data ?? []).map((r) => {
        const deptId = r.dept_id as string | null;
        const uid = r.user_id as string | null;
        return {
          id: r.id as string,
          dept_id: deptId,
          user_id: uid,
          role_label: r.role_label as string | null,
          start_time: r.start_time as string,
          end_time: r.end_time as string,
          notes: r.notes as string | null,
          source: r.source as string,
          departments: deptId ? { name: dm.get(deptId) ?? '—' } : null,
          assignee: uid ? { full_name: sm.get(uid) ?? '—' } : null,
        };
      });
      if (filterUser) rows = rows.filter((r) => r.user_id === filterUser);
      if (filterDept) rows = rows.filter((r) => r.dept_id === filterDept);
      setShifts(rows);
    }
    setLoading(false);
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
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const days = useMemo(() => {
    const out: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      out.push(d);
    }
    return out;
  }, [weekStart]);

  const byDay = useMemo(() => {
    const m = new Map<string, ShiftRow[]>();
    for (const d of days) {
      const key = d.toDateString();
      m.set(key, []);
    }
    for (const s of shifts) {
      const dt = new Date(s.start_time);
      const key = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).toDateString();
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(s);
    }
    return m;
  }, [days, shifts]);

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
    setShiftEditorOpen(true);
    setTimeout(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  const scopeSegments = [
    { mode: 'my' as const, label: 'My schedule', show: true },
    { mode: 'team' as const, label: 'Department', show: canTeam },
    { mode: 'full' as const, label: 'Full rota', show: canFull },
  ].filter((x) => x.show);

  const fieldSelect =
    'rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-2.5 py-2 text-sm text-[#121212] outline-none focus:border-[#121212] focus:ring-[3px] focus:ring-[#121212]/10';

  function shiftTitleLines(s: ShiftRow): { time: string; primary: string; secondary: string | null } {
    const time = `${new Date(s.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–${new Date(s.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    if (view === 'my') {
      return {
        time,
        primary: s.departments?.name ?? 'Shift',
        secondary: s.role_label,
      };
    }
    return {
      time,
      primary: s.assignee?.full_name ?? 'Unassigned',
      secondary: [s.departments?.name, s.role_label].filter(Boolean).join(' · ') || null,
    };
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-[28px]">
      <div className="mb-5">
        <h1 className="font-authSerif text-[22px] tracking-tight text-[#121212]">Rota</h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">Your schedule and team shifts.</p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 rounded-lg border border-[#d8d8d8] bg-white p-1 w-fit">
        {scopeSegments.map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            onClick={() => setView(mode)}
            className={[
              'rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors',
              view === mode
                ? 'bg-[#121212] text-[#faf9f6]'
                : 'text-[#6b6b6b] hover:bg-[#f5f4f1]',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d8d8d8] bg-[#faf9f6] px-5 py-4 sm:px-7">
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
          <div className="flex rounded-lg border border-[#d8d8d8] overflow-hidden">
            <button
              type="button"
              onClick={() => setListMode(false)}
              className={[
                'border-r border-[#d8d8d8] px-3.5 py-1.5 text-[12.5px] transition-colors',
                !listMode ? 'bg-[#121212] text-[#faf9f6]' : 'bg-white text-[#6b6b6b] hover:bg-[#f5f4f1]',
              ].join(' ')}
            >
              Week
            </button>
            <button
              type="button"
              onClick={() => setListMode(true)}
              className={[
                'px-3.5 py-1.5 text-[12.5px] transition-colors',
                listMode ? 'bg-[#121212] text-[#faf9f6]' : 'bg-white text-[#6b6b6b] hover:bg-[#f5f4f1]',
              ].join(' ')}
            >
              List
            </button>
          </div>
          <button
            type="button"
            className="rounded-lg border border-[#d8d8d8] bg-white px-3.5 py-2 text-[13px] text-[#6b6b6b] transition-colors hover:bg-[#f5f4f1]"
            onClick={() => window.alert('Import from Google Sheets is coming soon.')}
          >
            Import Sheets
          </button>
          {canFull ? (
            <button
              type="button"
              className="text-[12.5px] text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]"
              onClick={() => exportCsv()}
            >
              Export CSV
            </button>
          ) : null}
          {canEdit ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] transition hover:-translate-y-px hover:bg-[#2a2a2a] active:translate-y-0"
              onClick={openAddShift}
            >
              + Add shift
            </button>
          ) : null}
        </div>
      </div>

      {(view === 'team' || view === 'full') && (
        <div className="flex flex-wrap gap-3 border-b border-[#d8d8d8] bg-[#faf9f6] px-5 py-3 sm:px-7">
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

      <div className="overflow-x-auto px-5 py-5 sm:px-7">
        {loading ? (
          <p className="text-sm text-[#6b6b6b]">Loading…</p>
        ) : listMode ? (
          <ul className="flex flex-col gap-2.5">
            {shifts.length === 0 ? (
              <li className="text-sm text-[#6b6b6b]">No shifts this week.</li>
            ) : (
              shifts.map((s) => {
                const v = shiftVariant(s.dept_id ?? s.id);
                const { time, primary, secondary } = shiftTitleLines(s);
                return (
                  <li
                    key={s.id}
                    className="flex items-start gap-3 rounded-xl border border-[#d8d8d8] bg-white px-[18px] py-3"
                  >
                    <span className={`mt-1 h-8 w-1 shrink-0 rounded-full ${v.bg} ring-1 ${v.border}`} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className={`text-[11.5px] font-semibold ${v.text}`}>{time}</div>
                      <div className="mt-0.5 font-medium text-[#121212]">{primary}</div>
                      {secondary ? (
                        <div className="mt-0.5 truncate text-[12.5px] text-[#6b6b6b]" title={secondary}>
                          {secondary}
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        ) : shifts.length === 0 ? (
          <p className="py-12 text-center text-sm text-[#6b6b6b]">No shifts this week.</p>
        ) : (
          <div className="grid min-w-[700px] grid-cols-[100px_repeat(7,minmax(0,1fr))] gap-2">
            <div aria-hidden className="min-h-[1px]" />
            {days.map((d) => {
              const dayIsToday = isToday(d);
              return (
                <div
                  key={d.toISOString()}
                  className="rounded-lg bg-[#f5f4f1] px-1 py-2 text-center"
                >
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
                    {d.toLocaleDateString(undefined, { weekday: 'short' })}
                  </div>
                  {dayIsToday ? (
                    <div className="mx-auto mt-0.5 flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[#121212] font-authSerif text-[20px] text-[#faf9f6]">
                      {d.getDate()}
                    </div>
                  ) : (
                    <div className="mt-0.5 font-authSerif text-[20px] text-[#121212]">{d.getDate()}</div>
                  )}
                </div>
              );
            })}

            <div className="flex flex-col gap-1 pt-[44px]">
              {TIME_LABELS.map((t) => (
                <div key={t} className="flex min-h-[64px] items-start justify-end pr-2">
                  <span className="text-[10.5px] text-[#9b9b9b]">{t}</span>
                </div>
              ))}
            </div>

            {days.map((d) => {
              const key = d.toDateString();
              const list = byDay.get(key) ?? [];
              return (
                <div key={`col-${key}`} className="flex flex-col gap-1">
                  {list.length === 0 ? (
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => canEdit && openAddShift()}
                      className={[
                        'flex min-h-[min(768px,60vh)] items-center justify-center rounded-lg border border-dashed border-[#d8d8d8] text-sm text-[#9b9b9b] transition-colors',
                        canEdit ? 'cursor-pointer hover:border-[#c8c8c8] hover:bg-[#faf9f6]' : 'cursor-default',
                      ].join(' ')}
                    >
                      +
                    </button>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {list.map((s) => {
                        const v = shiftVariant(s.dept_id ?? s.id);
                        const { time, primary, secondary } = shiftTitleLines(s);
                        const title = [primary, secondary, s.notes].filter(Boolean).join(' — ');
                        return (
                          <div
                            key={s.id}
                            title={title}
                            className={[
                              'cursor-default rounded-lg border px-2.5 py-2 text-[11.5px] transition hover:opacity-90',
                              v.bg,
                              v.border,
                              v.text,
                            ].join(' ')}
                          >
                            <div className="font-semibold leading-tight">{time}</div>
                            <div className="mt-0.5 truncate leading-snug">{primary}</div>
                            {secondary ? (
                              <div className="mt-0.5 truncate text-[10.5px] opacity-90">{secondary}</div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {canEdit ? (
        <div ref={editorRef} className="mt-2 px-5 sm:px-[28px]">
          <ShiftEditor
            profile={profile}
            departments={departments}
            staff={staff}
            managedDeptIds={managedDeptIds}
            open={shiftEditorOpen}
            onOpenChange={setShiftEditorOpen}
            onSaved={() => void load()}
          />
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
  open,
  onOpenChange,
  onSaved,
}: {
  profile: Profile;
  departments: { id: string; name: string }[];
  staff: { id: string; full_name: string }[];
  managedDeptIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [deptId, setDeptId] = useState('');
  const [userId, setUserId] = useState(profile.id);
  const [roleLabel, setRoleLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [startLocal, setStartLocal] = useState('');
  const [endLocal, setEndLocal] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const deptOptions =
    profile.role === 'manager'
      ? departments.filter((d) => managedDeptIds.includes(d.id))
      : departments;

  const fieldClass =
    'mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-sm text-[#121212] outline-none focus:border-[#121212] focus:ring-[3px] focus:ring-[#121212]/10';

  async function save() {
    setMsg(null);
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
    const { error } = await supabase.from('rota_shifts').insert({
      org_id: profile.org_id,
      dept_id: deptId || null,
      user_id: userId || null,
      role_label: roleLabel || null,
      notes: notes || null,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      source: 'manual',
    });
    if (error) {
      setMsg(error.message);
      return;
    }
    onOpenChange(false);
    onSaved();
  }

  return (
    <div className="rounded-xl border border-[#d8d8d8] bg-white p-5">
      <button
        type="button"
        className="text-[13px] font-medium text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]"
        onClick={() => onOpenChange(!open)}
      >
        {open ? 'Hide add shift' : '+ Add shift'}
      </button>
      {open ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-[13px] font-medium text-[#6b6b6b]">
            Department
            <select className={fieldClass} value={deptId} onChange={(e) => setDeptId(e.target.value)}>
              <option value="">—</option>
              {deptOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[13px] font-medium text-[#6b6b6b]">
            Staff
            <select className={fieldClass} value={userId} onChange={(e) => setUserId(e.target.value)}>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
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
          {msg ? <p className="text-sm text-[#b91c1c] sm:col-span-2">{msg}</p> : null}
          <button
            type="button"
            className="rounded-lg bg-[#121212] px-4 py-2.5 text-sm font-medium text-[#faf9f6] transition hover:bg-[#2a2a2a] sm:col-span-2"
            onClick={() => void save()}
          >
            Save shift
          </button>
        </div>
      ) : null}
    </div>
  );
}
