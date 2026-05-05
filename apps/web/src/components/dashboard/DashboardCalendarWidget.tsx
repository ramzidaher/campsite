'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ChronologyTimeline, type ChronoGroup } from '@/components/experience/ChronologyTimeline';
import { ExperienceLensBar } from '@/components/experience/ExperienceLensBar';
import { DashboardMiniCalendar } from '@/components/dashboard/DashboardMiniCalendar';
import type { UpcomingEventRow } from '@/lib/dashboard/loadDashboardHome';
import { calendarYmdInTimeZone, mergeOrgTimeZoneIntoFormatOptions } from '@/lib/datetime';

const UPCOMING_LENS_KEY = 'campsite_dashboard_upcoming_lens';

function orgDayKey(d: Date, orgTz: string | null | undefined) {
  const { y, m, d: day } = calendarYmdInTimeZone(d, orgTz);
  return `${y}-${m}-${day}`;
}

export function DashboardCalendarWidget({
  eventDays,
  initialYear,
  initialMonth,
  todayY,
  todayM,
  todayD,
  upcomingEvents,
  orgTimeZone = null,
}: {
  eventDays: number[];
  initialYear: number;
  initialMonth: number;
  todayY: number;
  todayM: number;
  todayD: number;
  upcomingEvents: UpcomingEventRow[];
  orgTimeZone?: string | null;
}) {
  const [upcomingLens, setUpcomingLens] = useState<'peek' | 'timeline'>('peek');

  const eventTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(
        'en-US',
        mergeOrgTimeZoneIntoFormatOptions(orgTimeZone, {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
      ),
    [orgTimeZone],
  );
  const eventDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(
        'en-US',
        mergeOrgTimeZoneIntoFormatOptions(orgTimeZone, { month: 'short', day: 'numeric' }),
      ),
    [orgTimeZone],
  );

  const formatEventWhen = useCallback(
    (iso: string) => {
      const d = new Date(iso);
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const isToday = orgDayKey(d, orgTimeZone) === orgDayKey(now, orgTimeZone);
      const isTomorrow = orgDayKey(d, orgTimeZone) === orgDayKey(tomorrow, orgTimeZone);
      const time = eventTimeFormatter.format(d);
      if (isToday) return `Today · ${time}`;
      if (isTomorrow) return `Tomorrow · ${time}`;
      return `${eventDateFormatter.format(d)} · ${time}`;
    },
    [eventDateFormatter, eventTimeFormatter, orgTimeZone],
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(UPCOMING_LENS_KEY);
      if (raw === 'peek' || raw === 'timeline') setUpcomingLens(raw);
    } catch {
      /* ignore */
    }
  }, []);

  const persistLens = (next: 'peek' | 'timeline') => {
    setUpcomingLens(next);
    try {
      window.localStorage.setItem(UPCOMING_LENS_KEY, next);
    } catch {
      /* ignore */
    }
  };

  const preview = upcomingEvents.slice(0, 3);

  const timelineGroups = useMemo((): ChronoGroup[] => {
    if (upcomingEvents.length === 0) return [];
    const sorted = [...upcomingEvents].sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
    );
    type G = { heading: string; items: ChronoGroup['items'] };
    const groups: G[] = [];
    for (const ev of sorted) {
      const d = new Date(ev.start_time);
      const heading = d.toLocaleDateString(
        'en-GB',
        mergeOrgTimeZoneIntoFormatOptions(orgTimeZone, {
          weekday: 'long',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
      );
      const prev = groups[groups.length - 1];
      const item = {
        id: ev.id,
        title: ev.title,
        subtitle: `${formatEventWhen(ev.start_time)}${ev.kind === 'shift' ? ' · Shift' : ' · Event'}`,
        href: ev.kind === 'shift' ? '/rota' : '/calendar',
        accentColor: ev.color,
      };
      if (prev && prev.heading === heading) prev.items.push(item);
      else groups.push({ heading, items: [item] });
    }
    return groups;
  }, [upcomingEvents, orgTimeZone, formatEventWhen]);

  return (
    <div className="overflow-hidden rounded-xl border border-[#d8d8d8] bg-white">
      <DashboardMiniCalendar
        embedded
        eventDays={eventDays}
        initialYear={initialYear}
        initialMonth={initialMonth}
        todayY={todayY}
        todayM={todayM}
        todayD={todayD}
        orgTimeZone={orgTimeZone}
      />
      <div className="border-t border-[#d8d8d8] px-3.5 pb-3 pt-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#9b9b9b]">Upcoming</div>
          <ExperienceLensBar
            ariaLabel="Upcoming events layout"
            value={upcomingLens}
            onChange={persistLens}
            choices={[
              { value: 'peek', label: 'Peek' },
              { value: 'timeline', label: 'Timeline' },
            ]}
          />
        </div>
        {upcomingLens === 'timeline' ? (
          <ChronologyTimeline groups={timelineGroups} />
        ) : (
          <div className="flex flex-col">
            {preview.length === 0 ? (
              <p className="py-4 text-center text-xs text-[#9b9b9b]">No upcoming events</p>
            ) : (
              preview.map((ev) => (
                <Link
                  key={ev.id}
                  href={ev.kind === 'shift' ? '/rota' : '/calendar'}
                  className="flex gap-2.5 border-b border-[#d8d8d8] py-2 last:border-0 hover:opacity-80"
                >
                  <span
                    className="mt-1 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: ev.color }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-medium text-[#121212]">
                      {ev.title}
                      {ev.kind === 'shift' ? (
                        <span className="ml-1.5 rounded-full border border-[#dbeafe] bg-[#eff6ff] px-1.5 py-0.5 text-[10px] font-semibold text-[#1d4ed8]">
                          Shift
                        </span>
                      ) : null}
                    </div>
                    <div className="text-[11.5px] text-[#9b9b9b]">{formatEventWhen(ev.start_time)}</div>
                  </div>
                </Link>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
