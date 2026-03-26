'use client';

import { useMemo, useState } from 'react';

const weekdays = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function monthMatrix(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startPad = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: { d: number; inMonth: boolean }[] = [];
  const prevDays = new Date(year, month, 0).getDate();
  for (let i = 0; i < startPad; i++) {
    cells.push({ d: prevDays - startPad + i + 1, inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ d, inMonth: true });
  }
  let n = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ d: n++, inMonth: false });
  }
  return cells;
}

export function DashboardMiniCalendar({
  eventDays,
  initialYear,
  initialMonth,
  todayY,
  todayM,
  todayD,
  /** When true, omit outer card border/radius (parent provides unified widget shell). */
  embedded = false,
}: {
  eventDays: number[];
  initialYear: number;
  initialMonth: number;
  todayY: number;
  todayM: number;
  todayD: number;
  embedded?: boolean;
}) {
  const [cursor, setCursor] = useState({ y: initialYear, m: initialMonth });
  const matrix = useMemo(() => monthMatrix(cursor.y, cursor.m), [cursor.y, cursor.m]);
  const eventSet = useMemo(() => {
    if (cursor.y !== initialYear || cursor.m !== initialMonth) return new Set<number>();
    return new Set(eventDays);
  }, [cursor.y, cursor.m, initialYear, initialMonth, eventDays]);

  const label = new Date(cursor.y, cursor.m, 1).toLocaleString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  function prev() {
    setCursor((c) => {
      const nm = c.m - 1;
      if (nm < 0) return { y: c.y - 1, m: 11 };
      return { y: c.y, m: nm };
    });
  }

  function next() {
    setCursor((c) => {
      const nm = c.m + 1;
      if (nm > 11) return { y: c.y + 1, m: 0 };
      return { y: c.y, m: nm };
    });
  }

  const body = (
    <>
      <div className="flex items-center justify-between border-b border-[#d8d8d8] px-[18px] py-3">
        <div className="font-authSerif text-[15px] text-[#121212]">{label}</div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={prev}
            className="flex h-[26px] w-[26px] items-center justify-center rounded-md border border-[#d8d8d8] text-xs text-[#6b6b6b] transition-colors hover:bg-[#f5f4f1]"
            aria-label="Previous month"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={next}
            className="flex h-[26px] w-[26px] items-center justify-center rounded-md border border-[#d8d8d8] text-xs text-[#6b6b6b] transition-colors hover:bg-[#f5f4f1]"
            aria-label="Next month"
          >
            ›
          </button>
        </div>
      </div>
      <div className="p-3">
        <div className="mb-1 grid grid-cols-7 gap-0.5">
          {weekdays.map((w) => (
            <div
              key={w}
              className="py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-[#9b9b9b]"
            >
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {matrix.map((cell, i) => {
            const isToday =
              cell.inMonth && cursor.y === todayY && cursor.m === todayM && cell.d === todayD;
            const hasEvent = cell.inMonth && eventSet.has(cell.d);
            return (
              <div
                key={i}
                className={[
                  'relative flex aspect-square items-center justify-center rounded-md text-xs transition-colors',
                  !cell.inMonth ? 'text-[#9b9b9b]/45' : 'cursor-pointer text-[#6b6b6b]',
                  cell.inMonth && !isToday ? 'hover:bg-[#f5f4f1] hover:text-[#121212]' : '',
                  isToday ? 'bg-[#121212] font-semibold text-[#faf9f6] hover:bg-[#333]' : '',
                ].join(' ')}
              >
                {cell.d}
                {hasEvent ? (
                  <span
                    className={[
                      'absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full',
                      isToday ? 'bg-[#faf9f6]' : 'bg-[#1D4ED8]',
                    ].join(' ')}
                    aria-hidden
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );

  if (embedded) {
    return body;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#d8d8d8] bg-white">{body}</div>
  );
}
