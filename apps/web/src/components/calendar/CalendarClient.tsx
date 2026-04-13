'use client';

import { canManageCalendarManualEvents, type ProfileRole } from '@campsite/types';
import { createClient } from '@/lib/supabase/client';
import {
  addDays,
  addMonths,
  addWeeks,
  endOfWeekExclusive,
  formatDateTimeRangeLocal,
  formatDayLabel,
  monthCalendarWeeks,
  startOfDayLocal,
  startOfMonth,
  startOfWeekMonday,
} from '@/lib/datetime';
import { useShellRefresh } from '@/hooks/useShellRefresh';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ManualEventForm } from '@/components/calendar/ManualEventForm';
import { TimeGridCalendar, type TimeGridItem } from '@/components/calendar/TimeGridCalendar';
import Link from 'next/link';

type Profile = {
  id: string;
  org_id: string;
  role: ProfileRole;
  full_name: string;
  org_timezone?: string | null;
};

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
  source: 'rota' | 'broadcast' | 'manual' | 'one_on_one';
  googleEventId: string | null;
  broadcastId: string | null;
};

type OneOnOneCalMeetingRow = {
  id: string;
  manager_user_id: string;
  report_user_id: string;
  manager_name: string;
  report_name: string;
  starts_at: string;
  ends_at: string | null;
  status: string;
};

function mapOneOnOneMeetingToCalItem(m: OneOnOneCalMeetingRow, profileId: string): CalItem {
  const isManager = m.manager_user_id === profileId;
  const otherName = (isManager ? m.report_name : m.manager_name)?.trim() || 'Colleague';
  const start = new Date(m.starts_at);
  const end = m.ends_at ? new Date(m.ends_at) : new Date(start.getTime() + 3600000);
  return {
    key: `oo-${m.id}`,
    kind: 'event',
    id: m.id,
    title: `1:1 · ${otherName}`,
    description: 'Scheduled 1:1 check-in.',
    start,
    end,
    allDay: false,
    source: 'one_on_one',
    googleEventId: null,
    broadcastId: null,
  };
}

function calendarSourceLabel(source: CalItem['source']): string {
  if (source === 'one_on_one') return '1:1';
  return source;
}

function sourceChipClass(source: CalItem['source'], todayCell: boolean): string {
  if (todayCell) {
    return 'bg-white/15 text-[rgba(250,249,246,0.92)]';
  }
  if (source === 'rota') {
    return 'bg-[#059669]/18 text-[#047857]';
  }
  if (source === 'broadcast') {
    return 'bg-[#44403c]/18 text-[#44403c]';
  }
  if (source === 'one_on_one') {
    return 'bg-[#0284c7]/18 text-[#0369a1]';
  }
  return 'bg-[#7C3AED]/18 text-[#6d28d9]';
}

function sourceLegendDotClass(source: CalItem['source']): string {
  if (source === 'rota') return 'bg-[#059669]';
  if (source === 'broadcast') return 'bg-[#44403c]';
  if (source === 'one_on_one') return 'bg-[#0284c7]';
  return 'bg-[#7C3AED]';
}

function gridItemClass(source: CalItem['source']): string {
  if (source === 'rota') return 'bg-[#059669]/25 text-[#065f46] border-[#059669]/40';
  if (source === 'broadcast') return 'bg-[#44403c]/20 text-[#292524] border-[#44403c]/35';
  if (source === 'one_on_one') return 'bg-[#0284c7]/22 text-[#0c4a6e] border-[#0284c7]/45';
  return 'bg-[#7C3AED]/25 text-[#5b21b6] border-[#7C3AED]/40';
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
  const end = item.allDay
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

type ViewMode = 'month' | 'time1' | 'time4' | 'time7' | 'list';

const NAV_BTN =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#d8d8d8] bg-white text-sm text-[#6b6b6b] transition-colors hover:bg-[#f5f4f1]';

export function CalendarClient({ profile }: { profile: Profile }) {
  const supabase = useMemo(() => createClient(), []);
  const formSectionRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ViewMode>('month');
  const [anchor, setAnchor] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => startOfDayLocal(new Date()));
  const [gridStart, setGridStart] = useState(() => startOfWeekMonday(new Date()));
  const [items, setItems] = useState<CalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<CalItem | null>(null);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [composeKey, setComposeKey] = useState(0);
  const [draftRange, setDraftRange] = useState<{ start: Date; end: Date } | null>(null);
  const [initialCompose, setInitialCompose] = useState(() => ({
    start: new Date(),
    end: new Date(Date.now() + 3600000),
    allDay: false,
  }));

  const canManage = canManageCalendarManualEvents(profile.role);

  const todayStart = useMemo(() => startOfDayLocal(new Date()), []);

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
    if (view === 'time7') {
      const start = startOfWeekMonday(gridStart);
      return { from: start, to: endOfWeekExclusive(start) };
    }
    if (view === 'time4') {
      const start = startOfDayLocal(gridStart);
      const end = addDays(start, 4);
      return { from: start, to: end };
    }
    if (view === 'time1') {
      const start = startOfDayLocal(gridStart);
      const end = addDays(start, 1);
      return { from: start, to: end };
    }
    const start = startOfDayLocal(selectedDay);
    const end = addDays(start, 1);
    return { from: start, to: end };
  }, [view, anchor, selectedDay, gridStart]);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent === true;
      if (!silent) setLoading(true);
      const from = range.from.toISOString();
      const to = range.to.toISOString();

      const [shRes, evRes, ooRes] = await Promise.all([
        supabase
          .from('rota_shifts')
          .select('id, start_time, end_time, role_label, notes, dept_id, rotas(title,kind)')
          .eq('org_id', profile.org_id)
          .gte('start_time', from)
          .lt('start_time', to)
          .order('start_time'),
        supabase
          .from('calendar_events')
          .select(
            'id, title, description, start_time, end_time, all_day, source, broadcast_id, google_event_id',
          )
          .eq('org_id', profile.org_id)
          .in('source', ['broadcast', 'manual'])
          .gte('start_time', from)
          .lt('start_time', to)
          .order('start_time'),
        supabase.rpc('one_on_one_meetings_for_calendar', { p_from: from, p_to: to }),
      ]);

      if (shRes.error) console.error(shRes.error);
      if (evRes.error) console.error(evRes.error);
      if (ooRes.error) console.error(ooRes.error);

      const dm = new Map(departments.map((d) => [d.id, d.name]));
      const shiftItems: CalItem[] = (shRes.data ?? []).map((r) => {
        const start = new Date(r.start_time as string);
        const end = new Date(r.end_time as string);
        const dept = r.dept_id ? dm.get(r.dept_id as string) : null;
        const role = r.role_label as string | null;
        const rota = (r as { rotas?: { title?: string; kind?: string } | null }).rotas;
        const rotaBit = rota?.title?.trim() ? rota.title : null;
        const title =
          rotaBit || dept || role
            ? `Shift - ${rotaBit ?? dept ?? 'Dept'}${role ? ` (${role})` : ''}`
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

      let ooItems: CalItem[] = [];
      if (!ooRes.error && ooRes.data != null) {
        const raw = ooRes.data as unknown;
        const rows = Array.isArray(raw) ? (raw as OneOnOneCalMeetingRow[]) : [];
        ooItems = rows.map((m) => mapOneOnOneMeetingToCalItem(m, profile.id));
      }

      const merged = [...shiftItems, ...eventItems, ...ooItems].sort(
        (a, b) => a.start.getTime() - b.start.getTime(),
      );
      setItems(merged);
      setLoading(false);
    },
    [supabase, profile.org_id, profile.id, range.from, range.to, departments],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useShellRefresh(() => void load({ silent: true }));

  const monthWeeks = useMemo(() => monthCalendarWeeks(anchor), [anchor]);

  function itemsForDay(day: Date): CalItem[] {
    const k = localDayKey(day);
    return items.filter((it) => localDayKey(it.start) === k);
  }

  const timeGridDays = useMemo(() => {
    if (view === 'time7') {
      const s = startOfWeekMonday(gridStart);
      return Array.from({ length: 7 }, (_, i) => addDays(s, i));
    }
    if (view === 'time4') {
      const s = startOfDayLocal(gridStart);
      return Array.from({ length: 4 }, (_, i) => addDays(s, i));
    }
    return [startOfDayLocal(gridStart)];
  }, [view, gridStart]);

  const timeGridItems: TimeGridItem[] = useMemo(() => {
    return items.map((it) => ({
      key: it.key,
      title: it.title,
      start: it.start,
      end: it.end ?? (it.allDay ? addDays(it.start, 1) : new Date(it.start.getTime() + 3600000)),
      allDay: it.allDay,
      sourceClass: gridItemClass(it.source),
      onClick: () => setDetail(it),
    }));
  }, [items]);

  const onDraftTimesChange = useCallback((start: Date, end: Date, allDay: boolean) => {
    if (allDay) {
      setDraftRange(null);
      return;
    }
    setDraftRange({ start, end });
  }, []);

  function openComposeFromSlot(start: Date, end: Date) {
    setInitialCompose({ start, end, allDay: false });
    setDraftRange({ start, end });
    setComposeKey((k) => k + 1);
    setEventFormOpen(true);
    setTimeout(() => {
      formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  function openAddEvent() {
    const s = new Date(selectedDay);
    s.setHours(9, 0, 0, 0);
    const e = new Date(s.getTime() + 3600000);
    setInitialCompose({ start: s, end: e, allDay: false });
    setDraftRange({ start: s, end: e });
    setComposeKey((k) => k + 1);
    setEventFormOpen(true);
    setTimeout(() => {
      formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  const subtitleMonthYear = anchor.toLocaleString(undefined, { month: 'long', year: 'numeric' });

  const cardTitleLabel = useMemo(() => {
    if (view === 'month') {
      return anchor.toLocaleString(undefined, { month: 'long', year: 'numeric' });
    }
    if (view === 'time7') {
      return `Week of ${formatDayLabel(startOfWeekMonday(gridStart))}`;
    }
    if (view === 'time4') {
      const a = startOfDayLocal(gridStart);
      const b = addDays(a, 3);
      return `${formatDayLabel(a)} – ${formatDayLabel(b)}`;
    }
    if (view === 'time1') {
      return gridStart.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    }
    return selectedDay.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }, [view, anchor, gridStart, selectedDay]);

  function goPrev() {
    if (view === 'month') setAnchor((a) => addMonths(a, -1));
    else if (view === 'time7') setGridStart((g) => addWeeks(g, -1));
    else if (view === 'time4') setGridStart((g) => addDays(g, -4));
    else if (view === 'time1') setGridStart((g) => addDays(g, -1));
    else
      setSelectedDay((d) => {
        const x = new Date(d);
        x.setDate(x.getDate() - 1);
        return x;
      });
  }

  function goNext() {
    if (view === 'month') setAnchor((a) => addMonths(a, 1));
    else if (view === 'time7') setGridStart((g) => addWeeks(g, 1));
    else if (view === 'time4') setGridStart((g) => addDays(g, 4));
    else if (view === 'time1') setGridStart((g) => addDays(g, 1));
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
    const day = startOfDayLocal(t);
    setSelectedDay(day);
    setGridStart(view === 'time7' ? startOfWeekMonday(t) : day);
  }

  const viewSegments: { mode: ViewMode; label: string }[] = [
    { mode: 'month', label: 'Month' },
    { mode: 'time7', label: 'Week' },
    { mode: 'time4', label: '4 days' },
    { mode: 'time1', label: 'Day' },
    { mode: 'list', label: 'List' },
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
          <div className="flex flex-wrap rounded-lg border border-[#d8d8d8] overflow-hidden">
            {viewSegments.map(({ mode, label }) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  const day = startOfDayLocal(selectedDay);
                  if (mode === 'month') setAnchor(startOfMonth(selectedDay));
                  if (mode === 'time7') setGridStart(startOfWeekMonday(selectedDay));
                  if (mode === 'time4') setGridStart(day);
                  if (mode === 'time1') setGridStart(day);
                  setView(mode);
                }}
                className={[
                  'border-r border-[#d8d8d8] px-2.5 py-1.5 text-[12px] transition-colors last:border-r-0 sm:px-3.5 sm:text-[12.5px]',
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
            <span className="flex items-center gap-1.5">
              <span
                className={`inline-block h-2 w-2 shrink-0 rounded-full ${sourceLegendDotClass('one_on_one')}`}
              />
              1:1
            </span>
          </div>

          {loading ? (
            <p className="text-sm text-[#6b6b6b]">Loading...</p>
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
                        const d0 = startOfDayLocal(day);
                        setSelectedDay(d0);
                        setGridStart(d0);
                        const s = new Date(d0);
                        s.setHours(9, 0, 0, 0);
                        const e = new Date(s.getTime() + 3600000);
                        setView('time1');
                        openComposeFromSlot(s, e);
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
          ) : view === 'time7' || view === 'time4' || view === 'time1' ? (
            <TimeGridCalendar
              days={timeGridDays}
              items={timeGridItems}
              draftRange={eventFormOpen ? draftRange : null}
              onBackgroundClick={(dayStart, start, end) => {
                if (!canManage) return;
                setSelectedDay(dayStart);
                setGridStart(startOfDayLocal(dayStart));
                openComposeFromSlot(start, end);
              }}
              onItemClick={(key) => {
                const it = items.find((i) => i.key === key);
                if (it) setDetail(it);
              }}
            />
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
                        {calendarSourceLabel(it.source)}
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
            defaultDay={view === 'list' ? selectedDay : gridStart}
            open={eventFormOpen}
            onOpenChange={(o) => {
              setEventFormOpen(o);
              if (!o) setDraftRange(null);
            }}
            composeKey={composeKey}
            initialStart={initialCompose.start}
            initialEnd={initialCompose.end}
            initialAllDay={initialCompose.allDay}
            onDraftTimesChange={onDraftTimesChange}
            onSaved={() => void load()}
          />
        </div>
      ) : null}

      {detail ? (
        <DetailModal
          item={detail}
          profile={profile}
          orgTimezone={profile.org_timezone}
          onClose={() => setDetail(null)}
          onDeleted={() => {
            setDetail(null);
            void load();
          }}
          onRsvpChanged={() => void load()}
        />
      ) : null}
    </div>
  );
}

function DetailModal({
  item,
  profile,
  orgTimezone,
  onClose,
  onDeleted,
  onRsvpChanged,
}: {
  item: CalItem;
  profile: Profile;
  orgTimezone?: string | null;
  onClose: () => void;
  onDeleted: () => void;
  onRsvpChanged: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const canManage = canManageCalendarManualEvents(profile.role);
  const [busy, setBusy] = useState(false);
  const [attendees, setAttendees] = useState<
    { profile_id: string; status: string; full_name: string | null }[]
  >([]);
  const [myRsvp, setMyRsvp] = useState<string | null>(null);

  const isManualEvent = item.kind === 'event' && item.source === 'manual';
  const isOneOnOne = item.source === 'one_on_one';

  useEffect(() => {
    if (!isManualEvent) return;
    void (async () => {
      const { data, error } = await supabase
        .from('calendar_event_attendees')
        .select('profile_id, status, profiles(full_name)')
        .eq('event_id', item.id);
      if (error) {
        console.error(error);
        return;
      }
      const rows = (data ?? []) as unknown as {
        profile_id: string;
        status: string;
        profiles: { full_name: string | null } | null;
      }[];
      setAttendees(
        rows.map((r) => ({
          profile_id: r.profile_id,
          status: r.status,
          full_name: r.profiles?.full_name ?? null,
        })),
      );
      const mine = rows.find((r) => r.profile_id === profile.id);
      setMyRsvp(mine?.status ?? null);
    })();
  }, [supabase, item.id, isManualEvent, profile.id]);

  const timeLine =
    item.allDay
      ? item.start.toLocaleDateString()
      : item.source === 'rota' || item.source === 'one_on_one'
        ? formatDateTimeRangeLocal(
            item.start,
            item.end ?? new Date(item.start.getTime() + 3600000),
            orgTimezone,
          )
        : `${item.start.toLocaleString()} - ${(item.end ?? item.start).toLocaleString()}`;

  async function setRsvp(status: 'accepted' | 'declined' | 'tentative') {
    setBusy(true);
    const { error } = await supabase
      .from('calendar_event_attendees')
      .update({ status })
      .eq('event_id', item.id)
      .eq('profile_id', profile.id);
    setBusy(false);
    if (!error) {
      setMyRsvp(status);
      onRsvpChanged();
    }
  }

  async function deleteEvent() {
    if (!confirm('Delete this event? Attendees will be notified.')) return;
    setBusy(true);
    const { error } = await supabase.from('calendar_events').delete().eq('id', item.id);
    setBusy(false);
    if (!error) onDeleted();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-[2px] sm:items-center">
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-[#d8d8d8] bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_12px_32px_rgba(0,0,0,0.07)]">
        <h2 className="font-authSerif text-xl text-[#121212]">{item.title}</h2>
        <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
          {calendarSourceLabel(item.source)}
        </p>
        <p className="mt-3 text-sm text-[#6b6b6b]">{timeLine}</p>
        {item.description ? (
          <p className="mt-3 whitespace-pre-wrap text-sm text-[#121212]">{item.description}</p>
        ) : null}

        {isManualEvent && attendees.length > 0 ? (
          <div className="mt-4 border-t border-[#ececec] pt-4">
            <p className="text-[12px] font-semibold text-[#121212]">Attendees</p>
            <ul className="mt-2 space-y-1 text-sm text-[#6b6b6b]">
              {attendees.map((a) => (
                <li key={a.profile_id}>
                  {a.full_name?.trim() || 'Member'} — {a.status}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {isManualEvent && attendees.some((a) => a.profile_id === profile.id) ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-medium text-[#6b6b6b]">Your RSVP:</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void setRsvp('accepted')}
              className={`rounded-lg px-2 py-1 text-[12px] ${myRsvp === 'accepted' ? 'bg-[#121212] text-white' : 'border border-[#d8d8d8]'}`}
            >
              Going
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void setRsvp('tentative')}
              className={`rounded-lg px-2 py-1 text-[12px] ${myRsvp === 'tentative' ? 'bg-[#121212] text-white' : 'border border-[#d8d8d8]'}`}
            >
              Maybe
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void setRsvp('declined')}
              className={`rounded-lg px-2 py-1 text-[12px] ${myRsvp === 'declined' ? 'bg-[#121212] text-white' : 'border border-[#d8d8d8]'}`}
            >
              Decline
            </button>
          </div>
        ) : null}

        {isOneOnOne ? (
          <Link
            href={`/one-on-ones/${item.id}`}
            className="mt-4 inline-block rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] transition hover:bg-[#2a2a2a]"
          >
            Open 1:1 check-in
          </Link>
        ) : item.googleEventId ? (
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

        {canManage && isManualEvent ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void deleteEvent()}
            className="mt-4 block w-full rounded-lg border border-[#fecaca] bg-[#fef2f2] py-2.5 text-sm text-[#b91c1c] transition hover:bg-[#fee2e2] disabled:opacity-50"
          >
            Delete event
          </button>
        ) : null}

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
