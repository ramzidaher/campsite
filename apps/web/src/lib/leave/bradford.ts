/**
 * Sickness absence scoring helpers (UK HR: often called “Bradford factor”).
 * We use plain language in the product UI; this module keeps the shared merge/score logic.
 */

/** Clip interval to [windowStart, windowEnd] inclusive; returns null if no overlap. */
export function clipDateRangeToWindow(
  start: string,
  end: string,
  windowStart: string,
  windowEnd: string,
): { start: string; end: string } | null {
  const s = start <= windowStart ? windowStart : start;
  const e = end >= windowEnd ? windowEnd : end;
  if (s > e) return null;
  return { start: s, end: e };
}

/**
 * Merge overlapping or calendar-contiguous sick intervals (end + 1 day >= next start).
 * Score = (number of separate absences)² × (total calendar days lost), over the rolling window.
 */
export function bradfordFromAbsenceRanges(
  ranges: readonly { start_date: string; end_date: string }[],
  windowStart: string,
  windowEnd: string,
): { spellCount: number; totalDays: number; bradfordScore: number } {
  const clipped: { start: string; end: string }[] = [];
  for (const r of ranges) {
    const c = clipDateRangeToWindow(r.start_date, r.end_date, windowStart, windowEnd);
    if (c) clipped.push(c);
  }
  clipped.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.end < b.end ? -1 : 1));

  if (clipped.length === 0) {
    return { spellCount: 0, totalDays: 0, bradfordScore: 0 };
  }

  let curS = clipped[0]!.start;
  let curE = clipped[0]!.end;
  let spells = 0;
  let totalDays = 0;

  function daysInclusive(a: string, b: string): number {
    const d0 = new Date(`${a}T12:00:00Z`).getTime();
    const d1 = new Date(`${b}T12:00:00Z`).getTime();
    return Math.round((d1 - d0) / 86400000) + 1;
  }

  function addDays(isoDate: string, delta: number): string {
    const t = new Date(`${isoDate}T12:00:00Z`);
    t.setUTCDate(t.getUTCDate() + delta);
    return t.toISOString().slice(0, 10);
  }

  for (let i = 1; i < clipped.length; i++) {
    const r = clipped[i]!;
    if (r.start <= addDays(curE, 1)) {
      if (r.end > curE) curE = r.end;
    } else {
      spells += 1;
      totalDays += daysInclusive(curS, curE);
      curS = r.start;
      curE = r.end;
    }
  }
  spells += 1;
  totalDays += daysInclusive(curS, curE);

  const bradfordScore = spells * spells * totalDays;
  return { spellCount: spells, totalDays, bradfordScore };
}
