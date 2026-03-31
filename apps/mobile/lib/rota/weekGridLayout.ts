/** Visible day slice on the week grid (local calendar dates, aligned with `weekStart` columns). */
export const GRID_START_HOUR = 6;
export const GRID_END_HOUR = 22;
export const PX_PER_HOUR = 48;
export const SNAP_MINUTES = 15;

export const GRID_HEIGHT_PX = (GRID_END_HOUR - GRID_START_HOUR) * PX_PER_HOUR;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function localYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function minutesFromMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

type InternalEvt = {
  id: string;
  dayIndex: number;
  startMin: number;
  endMin: number;
  lane: number;
  laneCount: number;
};

function clampToGrid(startMin: number, endMin: number): { startMin: number; endMin: number } {
  const lo = GRID_START_HOUR * 60;
  const hi = GRID_END_HOUR * 60;
  const s = Math.max(startMin, lo);
  const e = Math.max(Math.min(endMin, hi), s + SNAP_MINUTES);
  return { startMin: s, endMin: e };
}

export function gridBandMinutesForShiftOnStartDay(start: Date, end: Date): { startMin: number; endMin: number } {
  const startMin = minutesFromMidnight(start);
  let endMin = minutesFromMidnight(end);
  if (end.getTime() <= start.getTime()) {
    return clampToGrid(startMin, startMin + SNAP_MINUTES);
  }
  if (localYmd(end) !== localYmd(start)) {
    endMin = 24 * 60;
  }
  return clampToGrid(startMin, endMin);
}

export function layoutWeekShifts(
  shifts: Array<{ id: string; start_time: string; end_time: string }>,
  weekDays: Date[],
): Array<{
  shiftId: string;
  dayIndex: number;
  topPx: number;
  heightPx: number;
  lane: number;
  laneCount: number;
}> {
  const internal: InternalEvt[] = [];

  for (const s of shifts) {
    const start = new Date(s.start_time);
    const end = new Date(s.end_time);
    const dayIndex = weekDays.findIndex((wd) => localYmd(wd) === localYmd(start));
    if (dayIndex < 0) continue;

    const startMin = minutesFromMidnight(start);
    let endMin = minutesFromMidnight(end);
    if (end.getTime() <= start.getTime()) continue;
    if (localYmd(end) !== localYmd(start)) {
      endMin = 24 * 60;
    }

    const c = clampToGrid(startMin, endMin);
    internal.push({
      id: s.id,
      dayIndex,
      startMin: c.startMin,
      endMin: c.endMin,
      lane: 0,
      laneCount: 1,
    });
  }

  const byDay = new Map<number, InternalEvt[]>();
  for (const e of internal) {
    const list = byDay.get(e.dayIndex) ?? [];
    list.push(e);
    byDay.set(e.dayIndex, list);
  }

  for (const [, evts] of byDay) {
    evts.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
    const laneEnds: number[] = [];
    for (const e of evts) {
      let lane = 0;
      while (lane < laneEnds.length && laneEnds[lane]! > e.startMin + 0.5) {
        lane++;
      }
      if (lane === laneEnds.length) laneEnds.push(e.endMin);
      else laneEnds[lane] = e.endMin;
      e.lane = lane;
    }
    const laneCount = Math.max(laneEnds.length, 1);
    for (const e of evts) {
      e.laneCount = laneCount;
    }
  }

  const out: Array<{
    shiftId: string;
    dayIndex: number;
    topPx: number;
    heightPx: number;
    lane: number;
    laneCount: number;
  }> = [];

  for (const e of internal) {
    const { lane, laneCount } = e;
    const lo = GRID_START_HOUR * 60;
    const topPx = ((e.startMin - lo) / 60) * PX_PER_HOUR;
    const heightPx = Math.max(((e.endMin - e.startMin) / 60) * PX_PER_HOUR, 22);
    out.push({
      shiftId: e.id,
      dayIndex: e.dayIndex,
      topPx,
      heightPx,
      lane,
      laneCount,
    });
  }

  return out;
}

export function slotHighlightPx(startMin: number, endMin: number): { topPx: number; heightPx: number } {
  const lo = GRID_START_HOUR * 60;
  const hi = GRID_END_HOUR * 60;
  let a = snapMinutesFromMidnight(startMin);
  let b = snapMinutesFromMidnight(endMin);
  if (b <= a) b = a + SNAP_MINUTES;
  a = Math.max(a, lo);
  b = Math.min(b, hi);
  if (b <= a) b = Math.min(hi, a + SNAP_MINUTES);
  return {
    topPx: ((a - lo) / 60) * PX_PER_HOUR,
    heightPx: Math.max(((b - a) / 60) * PX_PER_HOUR, 20),
  };
}

export function snapMinutesFromMidnight(mins: number): number {
  const lo = GRID_START_HOUR * 60;
  const hi = GRID_END_HOUR * 60;
  const c = Math.min(Math.max(mins, lo), hi);
  return Math.round((c - lo) / SNAP_MINUTES) * SNAP_MINUTES + lo;
}

export function movedShiftRange(
  originalStartIso: string,
  originalEndIso: string,
  targetDay: Date,
  newStartMinFromMidnight: number,
): { start_time: string; end_time: string } {
  const dur = new Date(originalEndIso).getTime() - new Date(originalStartIso).getTime();
  const snapped = snapMinutesFromMidnight(newStartMinFromMidnight);
  const start = new Date(targetDay);
  start.setHours(0, 0, 0, 0);
  const h = Math.floor(snapped / 60);
  const mi = snapped % 60;
  start.setHours(h, mi, 0, 0);
  const end = new Date(start.getTime() + dur);
  return { start_time: start.toISOString(), end_time: end.toISOString() };
}
