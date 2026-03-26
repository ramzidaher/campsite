'use client';

import Link from 'next/link';

import { DashboardMiniCalendar } from '@/components/dashboard/DashboardMiniCalendar';
import type { UpcomingEventRow } from '@/lib/dashboard/loadDashboardHome';

function formatEventWhen(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isToday = d.toDateString() === now.toDateString();
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (isToday) return `Today · ${time}`;
  if (isTomorrow) return `Tomorrow · ${time}`;
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${time}`;
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
                href="/calendar"
                className="flex gap-2.5 border-b border-[#d8d8d8] py-2 last:border-0 hover:opacity-80"
              >
                <span
                  className="mt-1 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: ev.color }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium text-[#121212]">{ev.title}</div>
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
