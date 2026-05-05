/** Month/day window used by org_celebration_modes (local calendar components). */
export type MonthDayWindow = {
  auto_start_month: number;
  auto_start_day: number;
  auto_end_month: number;
  auto_end_day: number;
};

function parseIsoParts(iso: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

function addCalendarDays(y: number, m: number, d: number, delta: number): { y: number; m: number; d: number } {
  const dt = new Date(y, m - 1, d + delta);
  return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
}

/**
 * Build an inclusive month/day window around an ISO date (YYYY-MM-DD).
 * Uses local calendar arithmetic (no UTC shift) so it matches celebration UI expectations.
 */
export function monthDayWindowFromIso(
  iso: string,
  padBefore = 1,
  padAfter = 1
): MonthDayWindow | null {
  const parts = parseIsoParts(iso);
  if (!parts) return null;
  const start = addCalendarDays(parts.y, parts.m, parts.d, -Math.max(0, padBefore));
  const end = addCalendarDays(parts.y, parts.m, parts.d, Math.max(0, padAfter));
  return {
    auto_start_month: start.m,
    auto_start_day: start.d,
    auto_end_month: end.m,
    auto_end_day: end.d,
  };
}
