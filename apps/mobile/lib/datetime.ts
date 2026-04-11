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
