/** DB weekday: Monday = 0 … Sunday = 6 (matches `rota_staff_availability_template.weekday` / `startOfWeekMonday`). */
export function templateWeekdayMon0(d: Date): number {
  const day = d.getDay();
  return day === 0 ? 6 : day - 1;
}

export type StaffAvailabilityTemplate = {
  user_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
};

export type StaffAvailabilityOverride = {
  user_id: string;
  on_date: string;
  start_time: string;
  end_time: string;
};

export type StaffAvailabilityHint = 'available' | 'outside' | 'unknown';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function localYmdFromDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Parse Postgres `time` like `09:00` or `09:00:00` to minutes from midnight. */
export function parseTimeToMinutes(t: string): number {
  const [h, m] = t.split(':').map((x) => Number(x));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

function minutesFromLocalDate(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** Half-open interval overlap in minutes. */
function intervalsOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

/**
 * Effective slots for `userId` on the calendar day of `dayAnchor` (local date of shift start).
 * If any override exists for that date for that user, use only overrides; else template for weekday.
 */
export function effectiveDaySlotsForUser(
  userId: string,
  dayAnchor: Date,
  templates: StaffAvailabilityTemplate[],
  overrides: StaffAvailabilityOverride[],
): { startM: number; endM: number }[] {
  const ymd = localYmdFromDate(dayAnchor);
  const dayOverrides = overrides.filter((o) => o.user_id === userId && o.on_date === ymd);
  if (dayOverrides.length > 0) {
    return dayOverrides.map((o) => ({
      startM: parseTimeToMinutes(o.start_time),
      endM: parseTimeToMinutes(o.end_time),
    }));
  }
  const wd = templateWeekdayMon0(dayAnchor);
  return templates
    .filter((t) => t.user_id === userId && t.weekday === wd)
    .map((t) => ({
      startM: parseTimeToMinutes(t.start_time),
      endM: parseTimeToMinutes(t.end_time),
    }));
}

export function staffAvailabilityHintForShift(
  userId: string,
  shiftStart: Date,
  shiftEnd: Date,
  templates: StaffAvailabilityTemplate[],
  overrides: StaffAvailabilityOverride[],
): StaffAvailabilityHint {
  const slots = effectiveDaySlotsForUser(userId, shiftStart, templates, overrides);
  const hasAnyData =
    templates.some((t) => t.user_id === userId) || overrides.some((o) => o.user_id === userId);

  if (slots.length === 0) {
    if (!hasAnyData) return 'unknown';
    return 'outside';
  }

  const sm = minutesFromLocalDate(shiftStart);
  const em = minutesFromLocalDate(shiftEnd);
  if (em <= sm) {
    for (const s of slots) {
      if (sm >= s.startM && sm < s.endM) return 'available';
    }
    return 'outside';
  }

  for (const s of slots) {
    if (intervalsOverlap(sm, em, s.startM, s.endM)) return 'available';
  }
  return 'outside';
}

export function formatAvailabilityHint(h: StaffAvailabilityHint): string {
  switch (h) {
    case 'available':
      return 'Available';
    case 'outside':
      return 'Outside availability';
    case 'unknown':
      return 'No availability on file';
    default:
      return '';
  }
}
