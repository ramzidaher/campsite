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

/**
 * Calendar year / month / day for an instant in an IANA zone (or local browser/server date when null/invalid).
 * Used so leave-year boundaries match the organisation’s “today”, not UTC alone.
 */
export function calendarYmdInTimeZone(
  instant: Date,
  timeZoneIana: string | null | undefined,
): { y: number; m: number; d: number } {
  const z = timeZoneIana?.trim();
  if (!z) {
    return {
      y: instant.getFullYear(),
      m: instant.getMonth() + 1,
      d: instant.getDate(),
    };
  }
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: z,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).formatToParts(instant);
    const y = Number(parts.find((p) => p.type === 'year')?.value);
    const m = Number(parts.find((p) => p.type === 'month')?.value);
    const d = Number(parts.find((p) => p.type === 'day')?.value);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
      throw new Error('invalid parts');
    }
    return { y, m, d };
  } catch {
    return {
      y: instant.getFullYear(),
      m: instant.getMonth() + 1,
      d: instant.getDate(),
    };
  }
}

/**
 * Leave year key `YYYY` using the same boundary rule as {@link currentLeaveYearKey}, but with “today”
 * evaluated in `orgTimeZoneIana` when set. Aligns SSR + client and avoids UTC-only off-by-one vs local.
 */
export function currentLeaveYearKeyForOrgCalendar(
  instant: Date,
  orgTimeZoneIana: string | null | undefined,
  leaveYearStartMonth: number,
  leaveYearStartDay: number,
): string {
  const { y, m, d } = calendarYmdInTimeZone(instant, orgTimeZoneIana);
  const sm = leaveYearStartMonth;
  const sd = leaveYearStartDay;
  if (m > sm || (m === sm && d >= sd)) {
    return String(y);
  }
  return String(y - 1);
}

/**
 * Human-readable entitlement window for a DB `leave_year` and org start rule (matches leave hub bounds).
 * Example: leave year "2025" with 1 Sep start → "1 Sep 2025 – 31 Aug 2026".
 */
export function formatLeaveYearPeriodRange(
  leaveYearKey: string,
  leaveYearStartMonth: number,
  leaveYearStartDay: number,
): string {
  const y = Number(leaveYearKey);
  const sm = Math.max(1, Math.min(12, leaveYearStartMonth));
  const sd = Math.max(1, Math.min(31, leaveYearStartDay));
  if (!Number.isFinite(y)) return leaveYearKey;
  const start = new Date(Date.UTC(y, sm - 1, sd));
  const end = new Date(Date.UTC(y + 1, sm - 1, sd));
  end.setUTCDate(end.getUTCDate() - 1);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
  return `${start.toLocaleDateString('en-GB', { ...(opts ?? {}), timeZone: 'UTC' })} – ${end.toLocaleDateString('en-GB', { ...(opts ?? {}), timeZone: 'UTC' })}`;
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

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Local midnight for the given instant’s calendar day. */
export function startOfDayLocal(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function formatDayLabel(d: Date): string {
  return d.toLocaleDateString('en-GB', { timeZone: 'UTC',  weekday: 'short', day: 'numeric', month: 'short' });
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
  const weekStart = startOfWeekMonday(startOfMonth(anchorMonth));
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
  return `${start.toLocaleTimeString('en-GB', { timeZone: 'UTC',  hour: '2-digit', minute: '2-digit', ...o })}-${end.toLocaleTimeString('en-GB', { timeZone: 'UTC',  hour: '2-digit', minute: '2-digit', ...o })}`;
}

export function formatDateTimeRangeLocal(start: Date, end: Date, iana?: string | null): string {
  const o = safeTimeZoneOptions(iana);
  return `${start.toLocaleString('en-GB', { timeZone: 'UTC',  ...o })} - ${end.toLocaleString('en-GB', { timeZone: 'UTC',  ...o })}`;
}
