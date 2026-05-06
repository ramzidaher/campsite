/**
 * Leave year label `YYYY` for DB `leave_allowances.leave_year` (calendar year of the leave period start).
 * Uses the device local calendar date so the boundary matches local “today”.
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

/**
 * Human-readable entitlement window for a DB `leave_year` (same bounds as web leave hub).
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
  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`;
}

export function leaveYearPeriodEndUtcCalendarYear(
  dbLeaveYearKey: string,
  leaveYearStartMonth: number,
  leaveYearStartDay: number,
): number {
  const y = Number(dbLeaveYearKey);
  const sm = Math.max(1, Math.min(12, leaveYearStartMonth));
  const sd = Math.max(1, Math.min(31, leaveYearStartDay));
  if (!Number.isFinite(y)) return NaN;
  const end = new Date(Date.UTC(y + 1, sm - 1, sd));
  end.setUTCDate(end.getUTCDate() - 1);
  return end.getUTCFullYear();
}

export function leaveYearUiKeyFromDbKey(
  dbLeaveYearKey: string,
  leaveYearStartMonth: number,
  leaveYearStartDay: number,
): string {
  const ey = leaveYearPeriodEndUtcCalendarYear(dbLeaveYearKey, leaveYearStartMonth, leaveYearStartDay);
  return Number.isFinite(ey) ? String(ey) : dbLeaveYearKey;
}

export function dbLeaveYearKeyFromUiKey(
  uiCalendarYear: number,
  leaveYearStartMonth: number,
  leaveYearStartDay: number,
): string {
  const sm = Math.max(1, Math.min(12, leaveYearStartMonth));
  const sd = Math.max(1, Math.min(31, leaveYearStartDay));
  if (!Number.isFinite(uiCalendarYear)) return String(uiCalendarYear);
  for (let delta = -2; delta <= 2; delta += 1) {
    const candidate = uiCalendarYear + delta;
    if (leaveYearPeriodEndUtcCalendarYear(String(candidate), sm, sd) === uiCalendarYear) {
      return String(candidate);
    }
  }
  return String(uiCalendarYear);
}
