'use client';

import Link from 'next/link';

import { DashboardMiniCalendar } from '@/components/dashboard/DashboardMiniCalendar';
import type { UpcomingEventRow } from '@/lib/dashboard/loadDashboardHome';

const EVENT_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'UTC',
});

const EVENT_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

function toUtcDayKey(d: Date) {
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

function formatEventWhen(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const isToday = toUtcDayKey(d) === toUtcDayKey(now);
  const isTomorrow = toUtcDayKey(d) === toUtcDayKey(tomorrow);
  const time = EVENT_TIME_FORMATTER.format(d);
  if (isToday) return `Today · ${time}`;
  if (isTomorrow) return `Tomorrow · ${time}`;
  return `${EVENT_DATE_FORMATTER.format(d)} · ${time}`;
}

export function DashboardCalendarWidget({
  eventDays,
  initialYear,
  initialMonth,
  todayY,
  todayM,
  todayD,
  upcomingEvents,
}: {
  eventDays: number[];
  initialYear: number;
  initialMonth: number;
  todayY: number;
  todayM: number;
  todayD: number;
  upcomingEvents: UpcomingEventRow[];
}) {
  const preview = upcomingEvents.slice(0, 3);

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
      />
      <div className="border-t border-[#d8d8d8] px-3.5 pb-3 pt-3">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#9b9b9b]">
          Upcoming
        </div>
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
      </div>
    </div>
  );
}
