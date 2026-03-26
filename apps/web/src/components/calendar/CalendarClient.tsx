'use client';

import { isOrgAdminRole, type ProfileRole } from '@campsite/types';
import { createClient } from '@/lib/supabase/client';
import {
  addMonths,
  addWeeks,
  endOfWeekExclusive,
  formatDayLabel,
  monthCalendarWeeks,
  startOfMonth,
  startOfWeekMonday,
} from '@/lib/datetime';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Profile = { id: string; org_id: string; role: ProfileRole; full_name: string };

type CalKind = 'shift' | 'event';

type CalItem = {
  key: string;
  kind: CalKind;
  id: string;
  title: string;
  description: string | null;
  start: Date;
  end: Date | null;
  allDay: boolean;
  source: 'rota' | 'broadcast' | 'manual';
  googleEventId: string | null;
  broadcastId: string | null;
};

/** Mock-aligned source colors: rota/shift green, broadcast blue, manual purple */
function sourceChipClass(source: CalItem['source'], todayCell: boolean): string {
  if (todayCell) {
    return 'bg-white/15 text-[rgba(250,249,246,0.92)]';
  }
  if (source === 'rota') {
    return 'bg-[#059669]/18 text-[#047857]';
  }
  if (source === 'broadcast') {
    return 'bg-[#1D4ED8]/18 text-[#1D4ED8]';
  }
  return 'bg-[#7C3AED]/18 text-[#6d28d9]';
}

function sourceLegendDotClass(source: CalItem['source']): string {
  if (source === 'rota') return 'bg-[#059669]';
  if (source === 'broadcast') return 'bg-[#1D4ED8]';
  return 'bg-[#7C3AED]';
}

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function googleCalendarUrl(item: CalItem): string {
  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '').slice(0, 15) + 'Z';
  const start = item.allDay ? item.start : item.start;
  const end =
    item.allDay
      ? new Date(item.start.getFullYear(), item.start.getMonth(), item.start.getDate() + 1)
      : item.end ?? new Date(item.start.getTime() + 3600000);
  const text = encodeURIComponent(item.title);
  const details = encodeURIComponent(item.description ?? '');
  if (item.allDay) {
    const ds = item.start.toISOString().slice(0, 10).replace(/-/g, '');
    const de = end.toISOString().slice(0, 10).replace(/-/g, '');
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${ds}/${de}&details=${details}`;
  }
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${fmt(start)}/${fmt(end)}&details=${details}`;
}

type ViewMode = 'month' | 'week' | 'day';

const NAV_BTN =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#d8d8d8] bg-white text-sm text-[#6b6b6b] transition-colors hover:bg-[#f5f4f1]';

export function CalendarClient({ profile }: { profile: Profile }) {
  const supabase = useMemo(() => createClient(), []);
  const formSectionRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ViewMode>('month');
  const [anchor, setAnchor] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  });
  const [items, setItems] = useState<CalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<CalItem | null>(null);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [eventFormOpen, setEventFormOpen] = useState(false);

  const canManage =
    profile.role === 'manager' ||
    isOrgAdminRole(profile.role);

  const todayStart = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('departments')
        .select('id,name')
        .eq('org_id', profile.org_id);
      setDepartments((data ?? []) as { id: string; name: string }[]);
    })();
  }, [supabase, profile.org_id]);

  const range = useMemo(() => {
    if (view === 'month') {
      const start = startOfMonth(anchor);
      const end = addMonths(start, 1);
      return { from: start, to: end };
    }
    if (view === 'week') {
      const start = startOfWeekMonday(anchor);
      return { from: start, to: endOfWeekExclusive(start) };
    }
    const start = new Date(selectedDay);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { from: start, to: end };
  }, [view, anchor, selectedDay]);

  const load = useCallback(async () => {
    setLoading(true);
    const from = range.from.toISOString();
    const to = range.to.toISOString();

    const [shRes, evRes] = await Promise.all([
      supabase
        .from('rota_shifts')
        .select('id, start_time, end_time, role_label, notes, dept_id')
        .eq('org_id', profile.org_id)
        .gte('start_time', from)
        .lt('start_time', to)
        .order('start_time'),
      supabase
        .from('calendar_events')
        .select(
          'id, title, description, start_time, end_time, all_day, source, broadcast_id, google_event_id'
        )
        .eq('org_id', profile.org_id)
        .in('source', ['broadcast', 'manual'])
        .gte('start_time', from)
        .lt('start_time', to)
        .order('start_time'),
    ]);

    if (shRes.error) console.error(shRes.error);
    if (evRes.error) console.error(evRes.error);

    const dm = new Map(departments.map((d) => [d.id, d.name]));
    const shiftItems: CalItem[] = (shRes.data ?? []).map((r) => {
      const start = new Date(r.start_time as string);
      const end = new Date(r.end_time as string);
      const dept = r.dept_id ? dm.get(r.dept_id as string) : null;
      const role = r.role_label as string | null;
      const title =
        dept || role
          ? `Shift — ${dept ?? 'Dept'}${role ? ` (${role})` : ''}`
          : 'Shift';
      return {
        key: `shift-${r.id}`,
        kind: 'shift' as const,
        id: r.id as string,
        title,
        description: (r.notes as string | null) ?? 'Campsite shift.',
        start,
        end,
        allDay: false,
        source: 'rota' as const,
        googleEventId: null,
        broadcastId: null,
      };
    });

    const eventItems: CalItem[] = (evRes.data ?? []).map((r) => {
      const src = r.source as 'broadcast' | 'manual';
      return {
        key: `evt-${r.id}`,
        kind: 'event' as const,
        id: r.id as string,
        title: r.title as string,
        description: (r.description as string | null) ?? null,
        start: new Date(r.start_time as string),
        end: r.end_time ? new Date(r.end_time as string) : null,
        allDay: !!(r.all_day as boolean),
        source: src === 'broadcast' ? 'broadcast' : 'manual',
        googleEventId: (r.google_event_id as string | null) ?? null,
        broadcastId: (r.broadcast_id as string | null) ?? null,
      };
    });

    const merged = [...shiftItems, ...eventItems].sort((a, b) => a.start.getTime() - b.start.getTime());
    setItems(merged);
    setLoading(false);
  }, [supabase, profile.org_id, range.from, range.to, departments]);

  useEffect(() => {
    void load();
  }, [load]);

  const monthWeeks = useMemo(() => monthCalendarWeeks(anchor), [anchor]);

  function itemsForDay(day: Date): CalItem[] {
    const k = localDayKey(day);
    return items.filter((it) => localDayKey(it.start) === k);
  }

  const weekDays = useMemo(() => {
    const s = startOfWeekMonday(view === 'week' ? anchor : selectedDay);
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(s);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, [view, anchor, selectedDay]);

  const subtitleMonthYear = anchor.toLocaleString(undefined, { month: 'long', year: 'numeric' });

  const cardTitleLabel =
    view === 'month'
      ? anchor.toLocaleString(undefined, { month: 'long', year: 'numeric' })
      : view === 'week'
        ? `Week of ${formatDayLabel(startOfWeekMonday(anchor))}`
        : selectedDay.toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          });

  function goPrev() {
    if (view === 'month') setAnchor((a) => addMonths(a, -1));
    else if (view === 'week') setAnchor((a) => addWeeks(a, -1));
    else
      setSelectedDay((d) => {
        const x = new Date(d);
        x.setDate(x.getDate() - 1);
        return x;
      });
  }

  function goNext() {
    if (view === 'month') setAnchor((a) => addMonths(a, 1));
    else if (view === 'week') setAnchor((a) => addWeeks(a, 1));
    else
      setSelectedDay((d) => {
        const x = new Date(d);
        x.setDate(x.getDate() + 1);
        return x;
      });
  }

  function goToday() {
    const t = new Date();
    setAnchor(startOfMonth(t));
    setSelectedDay(() => {
      const x = new Date(t);
      x.setHours(0, 0, 0, 0);
      return x;
    });
  }

  function openAddEvent() {
    setEventFormOpen(true);
    setTimeout(() => {
      formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  const viewSegments: { mode: ViewMode; label: string }[] = [
    { mode: 'month', label: 'Month' },
    { mode: 'week', label: 'Week' },
    { mode: 'day', label: 'Agenda' },
  ];

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-[28px]">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-authSerif text-[22px] tracking-tight text-[#121212]">Calendar</h1>
          <p className="mt-1 text-[13px] text-[#6b6b6b]">
            Showing events, shifts &amp; broadcasts for {subtitleMonthYear}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-[#d8d8d8] bg-white px-3.5 py-2 text-[13px] text-[#6b6b6b] transition-colors hover:bg-[#f5f4f1]"
            onClick={() => {
              window.alert('Google Calendar sync is coming soon.');
            }}
          >
            Sync Google Calendar
          </button>
          {canManage ? (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] transition hover:-translate-y-px hover:bg-[#2a2a2a] active:translate-y-0"
              onClick={openAddEvent}
            >
              + Add event
            </button>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#d8d8d8] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d8d8d8] px-5 py-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button type="button" className={NAV_BTN} aria-label="Previous" onClick={goPrev}>
              ‹
            </button>
            <div className="flex min-w-0 flex-wrap items-center gap-2 px-1">
              <span className="font-authSerif text-lg text-[#121212]">{cardTitleLabel}</span>
              <button
                type="button"
                className="text-[12.5px] text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]"
                onClick={goToday}
              >
                Today
              </button>
            </div>
            <button type="button" className={NAV_BTN} aria-label="Next" onClick={goNext}>
              ›
            </button>
          </div>
          <div className="flex rounded-lg border border-[#d8d8d8] overflow-hidden">
            {viewSegments.map(({ mode, label }) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  if (mode === 'week') setAnchor(startOfWeekMonday(selectedDay));
                  if (mode === 'month') setAnchor(startOfMonth(selectedDay));
                  setView(mode);
                }}
                className={[
                  'border-r border-[#d8d8d8] px-3.5 py-1.5 text-[12.5px] transition-colors last:border-r-0',
                  view === mode
                    ? 'bg-[#121212] text-[#faf9f6]'
                    : 'bg-white text-[#6b6b6b] hover:bg-[#f5f4f1]',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5">
          <div className="mb-4 flex flex-wrap gap-4 text-[11px] text-[#6b6b6b]">
            <span className="flex items-center gap-1.5">
              <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${sourceLegendDotClass('rota')}`} />
              Rota shift
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className={`inline-block h-2 w-2 shrink-0 rounded-full ${sourceLegendDotClass('broadcast')}`}
              />
              Broadcast
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className={`inline-block h-2 w-2 shrink-0 rounded-full ${sourceLegendDotClass('manual')}`}
              />
              Manual
            </span>
          </div>

          {loading ? (
            <p className="text-sm text-[#6b6b6b]">Loading…</p>
          ) : view === 'month' ? (
            <div className="overflow-x-auto">
              <div className="mb-2 grid grid-cols-7 gap-2">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                  <div
                    key={d}
                    className="py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]"
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {monthWeeks.flat().map((day) => {
                  const inMonth = day.getMonth() === anchor.getMonth();
                  const list = itemsForDay(day);
                  const isToday = isSameCalendarDay(day, todayStart);
                  const isSelected = day.toDateString() === selectedDay.toDateString();
                  const showRing = isSelected && !isToday;

                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      onClick={() => {
                        setSelectedDay(day);
                        setView('day');
                      }}
                      className={[
                        'min-h-[72px] rounded-lg p-1.5 text-left transition-opacity hover:opacity-90',
                        inMonth ? '' : 'opacity-40',
                        isToday ? 'bg-[#121212] text-[#faf9f6]' : 'bg-[#f5f4f1]',
                        showRing ? 'ring-1 ring-[#121212]/25' : '',
                      ].join(' ')}
                    >
                      <div
                        className={[
                          'text-[13px] font-semibold leading-none',
                          isToday ? 'text-[#faf9f6]' : 'text-[#121212]',
                        ].join(' ')}
                      >
                        {day.getDate()}
                      </div>
                      <div className="mt-1 flex flex-col gap-0.5">
                        {list.slice(0, 3).map((it) => (
                          <span
                            key={it.key}
                            className={[
                              'truncate rounded px-1.5 py-0.5 text-left text-[10.5px] leading-tight',
                              sourceChipClass(it.source, isToday),
                            ].join(' ')}
                            title={it.title}
                          >
                            {it.title}
                          </span>
                        ))}
                        {list.length > 3 ? (
                          <span
                            className={[
                              'text-[10px]',
                              isToday ? 'text-[#faf9f6]/70' : 'text-[#9b9b9b]',
                            ].join(' ')}
                          >
                            +{list.length - 3} more
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : view === 'week' ? (
            <div className="grid gap-2 md:grid-cols-7">
              {weekDays.map((day) => {
                const list = itemsForDay(day);
                return (
                  <div
                    key={day.toISOString()}
                    className="min-h-[140px] rounded-lg border border-[#d8d8d8] bg-[#f5f4f1] p-2"
                  >
                    <button
                      type="button"
                      className="w-full text-left text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b] hover:text-[#121212]"
                      onClick={() => {
                        setSelectedDay(day);
                        setView('day');
                      }}
                    >
                      {formatDayLabel(day)}
                    </button>
                    <div className="mt-2 space-y-1">
                      {list.map((it) => (
                        <button
                          key={it.key}
                          type="button"
                          onClick={() => setDetail(it)}
                          className={[
                            'block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium',
                            sourceChipClass(it.source, false),
                          ].join(' ')}
                        >
                          {it.title}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {itemsForDay(selectedDay).length === 0 ? (
                <li className="text-sm text-[#6b6b6b]">Nothing scheduled this day.</li>
              ) : (
                itemsForDay(selectedDay).map((it) => (
                  <li key={it.key}>
                    <button
                      type="button"
                      onClick={() => setDetail(it)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-[#d8d8d8] bg-white px-[18px] py-3 text-left text-sm transition-[box-shadow,border-color] hover:border-[#c8c8c8] hover:shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_12px_rgba(0,0,0,0.04)]"
                    >
                      <span className="min-w-0 flex-1 font-medium text-[#121212]">{it.title}</span>
                      <span
                        className={[
                          'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium',
                          sourceChipClass(it.source, false),
                        ].join(' ')}
                      >
                        {it.source}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      </div>

      {canManage ? (
        <div ref={formSectionRef} className="mt-6">
          <ManualEventForm
            profile={profile}
            departments={departments}
            defaultDay={selectedDay}
            open={eventFormOpen}
            onOpenChange={setEventFormOpen}
            onSaved={() => void load()}
          />
        </div>
      ) : null}

      {detail ? (
        <DetailModal item={detail} onClose={() => setDetail(null)} />
      ) : null}
    </div>
  );
}

function DetailModal({ item, onClose }: { item: CalItem; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-[2px] sm:items-center">
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-[#d8d8d8] bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_12px_32px_rgba(0,0,0,0.07)]">
        <h2 className="font-authSerif text-xl text-[#121212]">{item.title}</h2>
        <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
          {item.source}
        </p>
        <p className="mt-3 text-sm text-[#6b6b6b]">
          {item.allDay
            ? item.start.toLocaleDateString()
            : `${item.start.toLocaleString()} – ${(item.end ?? item.start).toLocaleString()}`}
        </p>
        {item.description ? (
          <p className="mt-3 whitespace-pre-wrap text-sm text-[#121212]">{item.description}</p>
        ) : null}
        {item.googleEventId ? (
          <p className="mt-3 text-sm text-[#6b6b6b]">Synced to Google Calendar</p>
        ) : (
          <a
            href={googleCalendarUrl(item)}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-block rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] transition hover:bg-[#2a2a2a]"
          >
            Add to Google Calendar
          </a>
        )}
        <button
          type="button"
          className="mt-4 block w-full rounded-lg border border-[#d8d8d8] py-2.5 text-sm text-[#6b6b6b] transition hover:bg-[#f5f4f1]"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}

function ManualEventForm({
  profile,
  departments,
  defaultDay,
  open,
  onOpenChange,
  onSaved,
}: {
  profile: Profile;
  departments: { id: string; name: string }[];
  defaultDay: Date;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [deptId, setDeptId] = useState('');
  const [startLocal, setStartLocal] = useState('');
  const [endLocal, setEndLocal] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setMsg(null);
    if (!title.trim()) {
      setMsg('Title is required.');
      return;
    }
    let start: Date;
    let end: Date | null = null;
    if (allDay) {
      start = new Date(defaultDay);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(end.getDate() + 1);
    } else {
      if (!startLocal) {
        setMsg('Start time required.');
        return;
      }
      start = new Date(startLocal);
      end = endLocal ? new Date(endLocal) : new Date(start.getTime() + 3600000);
      if (end <= start) {
        setMsg('End must be after start.');
        return;
      }
    }
    const { error } = await supabase.from('calendar_events').insert({
      org_id: profile.org_id,
      dept_id: deptId || null,
      title: title.trim(),
      description: description.trim() || null,
      start_time: start.toISOString(),
      end_time: end?.toISOString() ?? null,
      all_day: allDay,
      source: 'manual',
      created_by: profile.id,
    });
    if (error) {
      setMsg(error.message);
      return;
    }
    onOpenChange(false);
    setTitle('');
    setDescription('');
    onSaved();
  }

  const fieldClass =
    'mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-sm text-[#121212] outline-none transition focus:border-[#121212] focus:ring-[3px] focus:ring-[#121212]/10';

  return (
    <div className="rounded-xl border border-[#d8d8d8] bg-white p-5">
      <button
        type="button"
        className="text-[13px] font-medium text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]"
        onClick={() => onOpenChange(!open)}
      >
        {open ? 'Hide new event' : '+ New event'}
      </button>
      {open ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-[13px] font-medium text-[#6b6b6b] sm:col-span-2">
            Title
            <input className={fieldClass} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-sm text-[#121212] sm:col-span-2">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            All day
          </label>
          {!allDay ? (
            <>
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
            </>
          ) : (
            <p className="text-sm text-[#6b6b6b] sm:col-span-2">
              Uses the selected agenda day (or pick a day in Agenda view first).
            </p>
          )}
          <label className="text-[13px] font-medium text-[#6b6b6b] sm:col-span-2">
            Department (optional)
            <select className={fieldClass} value={deptId} onChange={(e) => setDeptId(e.target.value)}>
              <option value="">—</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[13px] font-medium text-[#6b6b6b] sm:col-span-2">
            Description
            <textarea
              className={fieldClass}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          {msg ? <p className="text-sm text-[#b91c1c] sm:col-span-2">{msg}</p> : null}
          <button
            type="button"
            className="rounded-lg bg-[#121212] px-4 py-2.5 text-sm font-medium text-[#faf9f6] transition hover:bg-[#2a2a2a] sm:col-span-2"
            onClick={() => void save()}
          >
            Save event
          </button>
        </div>
      ) : null}
    </div>
  );
}
