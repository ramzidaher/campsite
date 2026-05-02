'use client';

import { addDays, startOfDayLocal } from '@/lib/datetime';
import { useCallback, useMemo } from 'react';

const PX_PER_HOUR = 44;
const DAY_MINUTES = 24 * 60;
const SNAP_MIN = 30;

export type TimeGridItem = {
  key: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  sourceClass: string;
  onClick?: () => void;
};

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function minutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

function snapMinutes(m: number): number {
  return Math.round(m / SNAP_MIN) * SNAP_MIN;
}

export function TimeGridCalendar({
  days,
  items,
  draftRange,
  onBackgroundClick,
  onItemClick,
}: {
  days: Date[];
  items: TimeGridItem[];
  draftRange: { start: Date; end: Date } | null;
  onBackgroundClick: (day: Date, start: Date, end: Date) => void;
  onItemClick: (key: string) => void;
}) {
  const dayStarts = useMemo(() => days.map((d) => startOfDayLocal(d)), [days]);

  const itemsByDay = useMemo(() => {
    return dayStarts.map((dayStart) => {
      const dayEnd = addDays(dayStart, 1);
      const list = items.filter((it) => {
        if (it.allDay) return sameLocalDay(it.start, dayStart);
        return it.start < dayEnd && it.end > dayStart;
      });
      const timed = list
        .filter((it) => !it.allDay)
        .map((it) => {
          const start = it.start < dayStart ? dayStart : it.start;
          const end = it.end > dayEnd ? dayEnd : it.end;
          return { key: it.key, title: it.title, start, end, sourceClass: it.sourceClass, onClick: it.onClick };
        });
      const allDay = list.filter((it) => it.allDay);
      return { timed, allDay };
    });
  }, [items, dayStarts]);

  const totalPx = 24 * PX_PER_HOUR;

  const handleColumnClick = useCallback(
    (e: React.MouseEvent, dayStart: Date) => {
      if ((e.target as HTMLElement).closest('[data-cal-event="1"]')) return;
      const y = (e.nativeEvent as MouseEvent).offsetY;
      const clamped = Math.max(0, Math.min(y, totalPx));
      const rawMin = (clamped / totalPx) * DAY_MINUTES;
      const m = snapMinutes(rawMin);
      const start = new Date(dayStart);
      start.setHours(0, 0, 0, 0);
      start.setMinutes(m);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      onBackgroundClick(dayStart, start, end);
    },
    [onBackgroundClick, totalPx],
  );

  const draftLayouts = useMemo(() => {
    if (!draftRange) return null;
    return dayStarts.map((dayStart) => {
      const dayEnd = addDays(dayStart, 1);
      if (draftRange.start >= dayEnd || draftRange.end <= dayStart) return null;
      const start = draftRange.start < dayStart ? dayStart : draftRange.start;
      const end = draftRange.end > dayEnd ? dayEnd : draftRange.end;
      if (end <= start) return null;
      const top = (minutesSinceMidnight(start) / DAY_MINUTES) * totalPx;
      const h = Math.max(((end.getTime() - start.getTime()) / (DAY_MINUTES * 60 * 1000)) * totalPx, 20);
      return { top, height: h };
    });
  }, [draftRange, dayStarts, totalPx]);

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

  return (
    <div className="flex min-h-0 flex-col rounded-lg border border-[#d8d8d8] bg-[#faf9f6]">
      <div className="grid shrink-0 border-b border-[#d8d8d8] bg-white" style={{ gridTemplateColumns: `48px repeat(${days.length}, minmax(0,1fr))` }}>
        <div />
        {days.map((d) => (
          <div key={d.toISOString()} className="border-l border-[#e8e8e8] px-1 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-[#6b6b6b]">
            {d.toLocaleDateString('en-GB', { timeZone: 'UTC',  weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
        ))}
      </div>
      <div className="grid shrink-0 border-b border-[#e8e8e8] bg-white" style={{ gridTemplateColumns: `48px repeat(${days.length}, minmax(0,1fr))` }}>
        <div className="text-[10px] text-[#9b9b9b]">All day</div>
        {itemsByDay.map(({ allDay: allDayRow }, di) => (
          <div key={di} className="min-h-[32px] border-l border-[#f0f0f0] px-0.5 py-1">
            <div className="flex flex-wrap gap-0.5">
              {allDayRow.map((it) => (
                <button
                  key={it.key}
                  type="button"
                  data-cal-event="1"
                  onClick={() => {
                    it.onClick?.();
                    onItemClick(it.key);
                  }}
                  className={[
                    'max-w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium leading-tight',
                    it.sourceClass,
                  ].join(' ')}
                >
                  {it.title}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="max-h-[min(68vh,720px)] overflow-y-auto overflow-x-hidden">
        <div className="flex min-w-0" style={{ minHeight: totalPx }}>
          <div className="w-12 shrink-0 border-r border-[#e8e8e8] bg-white">
            {hours.map((h) => (
              <div
                key={h}
                className="pr-1 text-right text-[10px] tabular-nums text-[#9b9b9b]"
                style={{ height: PX_PER_HOUR, paddingTop: 2 }}
              >
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>
          {dayStarts.map((dayStart, di) => {
            const { timed } = itemsByDay[di];
            return (
              <div
                key={dayStart.toISOString()}
                className="relative min-w-[72px] flex-1 border-l border-[#e8e8e8] bg-white"
                style={{ minHeight: totalPx }}
                onClick={(e) => handleColumnClick(e, dayStart)}
                role="presentation"
              >
                {hours.map((h) => (
                  <div
                    key={h}
                    className="pointer-events-none absolute left-0 right-0 border-t border-[#f3f3f3]"
                    style={{ top: h * PX_PER_HOUR, height: PX_PER_HOUR }}
                  />
                ))}
                {timed.map((it) => {
                  const top = (minutesSinceMidnight(it.start) / DAY_MINUTES) * totalPx;
                  const h = Math.max(((it.end.getTime() - it.start.getTime()) / (DAY_MINUTES * 60 * 1000)) * totalPx, 18);
                  return (
                    <button
                      key={it.key}
                      type="button"
                      data-cal-event="1"
                      onClick={(e) => {
                        e.stopPropagation();
                        it.onClick?.();
                        onItemClick(it.key);
                      }}
                      className={[
                        'absolute left-1 right-1 overflow-hidden rounded border border-black/10 px-1 py-0.5 text-left text-[10px] font-medium leading-tight shadow-sm',
                        it.sourceClass,
                      ].join(' ')}
                      style={{
                        top,
                        height: h,
                      }}
                    >
                      <span className="line-clamp-3">{it.title}</span>
                    </button>
                  );
                })}
                {draftLayouts?.[di] ? (
                  <div
                    className="pointer-events-none absolute overflow-hidden rounded border-2 border-dashed border-[#7C3AED] bg-[#7C3AED]/20 px-1 py-0.5 text-[10px] font-medium text-[#5b21b6]"
                    style={{
                      top: draftLayouts[di]!.top,
                      height: draftLayouts[di]!.height,
                      left: 2,
                      right: 2,
                    }}
                  >
                    New event
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
