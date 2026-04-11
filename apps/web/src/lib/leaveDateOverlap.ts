/** Inclusive ISO date ranges (YYYY-MM-DD) overlap. */
export function inclusiveRangesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  return startA <= endB && startB <= endA;
}

export type LeaveLike = {
  id?: string;
  start_date: string;
  end_date: string;
  status: string;
  proposed_start_date?: string | null;
  proposed_end_date?: string | null;
};

/**
 * True if [start, end] overlaps any active leave booking in `rows` (same user’s requests).
 * Counts both stored dates and, for pending_edit, proposed dates. Ignores rejected/cancelled.
 */
export function leaveRangeOverlapsExisting(
  rows: LeaveLike[],
  start: string,
  end: string,
  excludeRequestId?: string,
): boolean {
  for (const r of rows) {
    if (excludeRequestId && r.id === excludeRequestId) continue;
    if (!['pending', 'approved', 'pending_edit', 'pending_cancel'].includes(r.status)) continue;

    const ranges: [string, string][] = [[r.start_date, r.end_date]];
    if (
      r.status === 'pending_edit' &&
      r.proposed_start_date &&
      r.proposed_end_date
    ) {
      ranges.push([r.proposed_start_date, r.proposed_end_date]);
    }
    for (const [rs, re] of ranges) {
      if (inclusiveRangesOverlap(start, end, rs, re)) return true;
    }
  }
  return false;
}
