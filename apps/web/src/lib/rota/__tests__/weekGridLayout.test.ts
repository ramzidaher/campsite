import {
  calendarEventForWeekLayout,
  GRID_START_HOUR,
  gridBandMinutesForShiftOnStartDay,
  layoutWeekShifts,
  movedShiftRange,
  snappedResizeShiftEnd,
  snappedResizeShiftStart,
  slotHighlightPx,
  snapMinutesFromMidnight,
} from '../weekGridLayout';

describe('weekGridLayout', () => {
  test('snapMinutesFromMidnight snaps to 15 within grid', () => {
    const lo = GRID_START_HOUR * 60;
    expect(snapMinutesFromMidnight(lo + 7)).toBe(lo);
    expect(snapMinutesFromMidnight(lo + 8)).toBe(lo + 15);
  });

  test('snapMinutesFromMidnight allows 22:00 (grid end)', () => {
    const hi = 22 * 60;
    expect(snapMinutesFromMidnight(hi)).toBe(hi);
    expect(snapMinutesFromMidnight(hi + 30)).toBe(hi);
  });

  test('snappedResizeShiftStart and End keep minimum duration', () => {
    const day = new Date(2026, 2, 31, 0, 0, 0, 0);
    const startIso = new Date(2026, 2, 31, 10, 0, 0, 0).toISOString();
    const endIso = new Date(2026, 2, 31, 12, 0, 0, 0).toISOString();
    const rs = snappedResizeShiftStart({ start_time: startIso, end_time: endIso }, day, 10 * 60 + 30);
    expect(rs).not.toBeNull();
    if (!rs) throw new Error('expected rs');
    expect(new Date(rs.start_time).getHours()).toBe(10);
    expect(new Date(rs.start_time).getMinutes()).toBe(30);
    const re = snappedResizeShiftEnd({ start_time: startIso, end_time: endIso }, day, 14 * 60);
    expect(re).not.toBeNull();
    if (!re) throw new Error('expected re');
    expect(new Date(re.end_time).getHours()).toBe(14);
  });

  test('movedShiftRange preserves duration and sets wall time', () => {
    const monday = new Date(2026, 2, 30, 0, 0, 0, 0);
    const startIso = new Date(2026, 2, 30, 10, 0, 0, 0).toISOString();
    const endIso = new Date(2026, 2, 30, 12, 30, 0, 0).toISOString();
    const newStartMin = 14 * 60;
    const { start_time, end_time } = movedShiftRange(startIso, endIso, monday, newStartMin);
    const ns = new Date(start_time);
    const ne = new Date(end_time);
    expect(ns.getHours()).toBe(14);
    expect(ns.getMinutes()).toBe(0);
    expect(ne.getTime() - ns.getTime()).toBe(new Date(endIso).getTime() - new Date(startIso).getTime());
  });

  test('gridBandMinutesForShiftOnStartDay matches same-day layout span', () => {
    const start = new Date(2026, 2, 31, 9, 30, 0, 0);
    const end = new Date(2026, 2, 31, 17, 0, 0, 0);
    const { startMin, endMin } = gridBandMinutesForShiftOnStartDay(start, end);
    expect(startMin).toBe(9 * 60 + 30);
    expect(endMin).toBe(17 * 60);
  });

  test('slotHighlightPx snaps and clamps to grid hours', () => {
    const lo = GRID_START_HOUR * 60;
    const { topPx, heightPx } = slotHighlightPx(lo + 30, lo + 90);
    expect(topPx).toBeGreaterThanOrEqual(0);
    expect(heightPx).toBeGreaterThanOrEqual(20);
    const again = slotHighlightPx(lo + 7, lo + 22);
    expect(again.heightPx).toBeGreaterThanOrEqual(20);
  });

  test('calendarEventForWeekLayout maps all-day to grid window', () => {
    const start = new Date(2026, 2, 31, 0, 0, 0, 0).toISOString();
    const out = calendarEventForWeekLayout({
      id: 'e1',
      start_time: start,
      end_time: null,
      all_day: true,
    });
    expect(out).not.toBeNull();
    if (!out) throw new Error('expected out');
    expect(new Date(out.start_time).getHours()).toBe(GRID_START_HOUR);
    expect(new Date(out.end_time).getHours()).toBe(22);
  });

  test('layoutWeekShifts assigns lanes for overlaps', () => {
    const monday = new Date(2026, 2, 30);
    const days = [monday, new Date(2026, 2, 31), new Date(2026, 3, 1), new Date(2026, 3, 2), new Date(2026, 3, 3), new Date(2026, 3, 4), new Date(2026, 3, 5)];
    const a = new Date(2026, 2, 30, 9, 0, 0, 0).toISOString();
    const b = new Date(2026, 2, 30, 10, 0, 0, 0).toISOString();
    const c = new Date(2026, 2, 30, 9, 30, 0, 0).toISOString();
    const d = new Date(2026, 2, 30, 11, 0, 0, 0).toISOString();
    const layout = layoutWeekShifts(
      [
        { id: '1', start_time: a, end_time: b },
        { id: '2', start_time: c, end_time: d },
      ],
      days,
    );
    expect(layout.length).toBe(2);
    expect(layout.every((l) => l.laneCount >= 1)).toBe(true);
  });
});
