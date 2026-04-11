/**
 * Leave year label `YYYY` for DB `leave_allowances.leave_year` / pro-rata: the calendar year of the
 * leave period start (`make_date(YYYY, leaveYearStartMonth, leaveYearStartDay)`).
 * Uses the viewer's local calendar date so the boundary matches local “today” (not UTC midnight comparisons).
 */
export function currentLeaveYearKey(
  today: Date,
  leaveYearStartMonth: number,
  leaveYearStartDay: number,
): string {
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const d = today.getDate();
  const sm = leaveYearStartMonth;
  const sd = leaveYearStartDay;
  if (m > sm || (m === sm && d >= sd)) {
    return String(y);
  }
  return String(y - 1);
}

/** Same rule as {@link currentLeaveYearKey} but using UTC calendar components (SSR / server clock). */
export function currentLeaveYearKeyUtc(
  instant: Date,
  leaveYearStartMonth: number,
  leaveYearStartDay: number,
): string {
  const y = instant.getUTCFullYear();
  const m = instant.getUTCMonth() + 1;
  const d = instant.getUTCDate();
  const sm = leaveYearStartMonth;
  const sd = leaveYearStartDay;
  if (m > sm || (m === sm && d >= sd)) {
    return String(y);
  }
  return String(y - 1);
}

/** Monday 00:00:00 local time for the week containing `d`. */
export function startOfWeekMonday(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Monday + 7 days (exclusive end for range queries). */
export function endOfWeekExclusive(startMonday: Date): Date {
  const e = new Date(startMonday);
  e.setDate(e.getDate() + 7);
  return e;
}

export function addWeeks(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n * 7);
  return x;
}

export function formatDayLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function startOfMonth(d: Date): Date {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfMonthExclusive(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

/** Month grid (Mon-Sun rows) covering all days in `anchorMonth`’s calendar month. */
export function monthCalendarWeeks(anchorMonth: Date): Date[][] {
  const lastDay = new Date(anchorMonth.getFullYear(), anchorMonth.getMonth() + 1, 0);
  let weekStart = startOfWeekMonday(startOfMonth(anchorMonth));
  const weeks: Date[][] = [];
  while (weeks.length === 0 || weekStart <= lastDay) {
    const row: Date[] = [];
    const d = new Date(weekStart);
    for (let i = 0; i < 7; i++) {
      row.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    weeks.push(row);
    weekStart.setDate(weekStart.getDate() + 7);
  }
  return weeks;
}

/** Valid IANA zone for `Intl`, or omit (browser local). */
export function safeTimeZoneOptions(iana: string | null | undefined): { timeZone?: string } {
  const z = iana?.trim();
  if (!z) return {};
  try {
    Intl.DateTimeFormat(undefined, { timeZone: z });
    return { timeZone: z };
  } catch {
    return {};
  }
}

export function formatShiftTimeRange(startIso: string, endIso: string, iana?: string | null): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const o = safeTimeZoneOptions(iana);
  return `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', ...o })}-${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', ...o })}`;
}

export function formatDateTimeRangeLocal(start: Date, end: Date, iana?: string | null): string {
  const o = safeTimeZoneOptions(iana);
  return `${start.toLocaleString(undefined, { ...o })} - ${end.toLocaleString(undefined, { ...o })}`;
}
