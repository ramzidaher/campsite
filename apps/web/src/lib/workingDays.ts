/** ISO-8601 weekday: Monday = 1 … Sunday = 7 (matches PostgreSQL `isodow`). */
export function utcIsoDowFromYmd(y: number, month: number, day: number): number {
  const wd = new Date(Date.UTC(y, month - 1, day, 12, 0, 0)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export type OrgLeaveDayOptions = {
  leaveUseWorkingDays: boolean;
  /** ISO weekdays (1=Mon … 7=Sun) that do not count toward leave. */
  nonWorkingIsoDows: number[];
  /** Exact ISO dates (YYYY-MM-DD) excluded from leave count (bank/public/org holidays). */
  excludedDates?: Set<string>;
};

/** Inclusive date range overlap, ISO YYYY-MM-DD. */
export function overlapInclusiveRange(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): { start: string; end: string } | null {
  const s = aStart > bStart ? aStart : bStart;
  const e = aEnd < bEnd ? aEnd : bEnd;
  if (s > e) return null;
  return { start: s, end: e };
}

/**
 * Days that count toward leave for this org (matches `leave_org_day_count_inclusive`).
 * Iterates UTC calendar days like the leave date inputs.
 */
export function countOrgLeaveDaysInclusive(
  startIso: string,
  endIso: string,
  options: OrgLeaveDayOptions,
): number {
  if (!startIso || !endIso || endIso < startIso) return 0;

  const [sy, sm, sd] = startIso.split('-').map((x) => Number(x));
  const [ey, em, ed] = endIso.split('-').map((x) => Number(x));
  let y = sy;
  let m = sm;
  let d = sd;
  let n = 0;
  const off = new Set(options.nonWorkingIsoDows ?? []);
  const excluded = options.excludedDates ?? new Set<string>();

  for (;;) {
    const isoDate = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isod = utcIsoDowFromYmd(y, m, d);
    if (excluded.has(isoDate)) {
      // Always exclude configured holiday periods from leave deduction.
    } else if (!options.leaveUseWorkingDays) {
      n += 1;
    } else if (!off.has(isod)) {
      n += 1;
    }
    if (y === ey && m === em && d === ed) break;
    const t = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    t.setUTCDate(t.getUTCDate() + 1);
    y = t.getUTCFullYear();
    m = t.getUTCMonth() + 1;
    d = t.getUTCDate();
  }

  return n;
}
