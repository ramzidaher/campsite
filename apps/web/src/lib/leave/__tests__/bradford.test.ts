import { bradfordFromAbsenceRanges, clipDateRangeToWindow } from '../bradford';

describe('clipDateRangeToWindow', () => {
  it('returns null when outside window', () => {
    expect(clipDateRangeToWindow('2025-01-01', '2025-01-02', '2025-06-01', '2025-06-30')).toBeNull();
  });

  it('clips to window', () => {
    expect(clipDateRangeToWindow('2025-06-01', '2025-08-01', '2025-06-15', '2025-07-15')).toEqual({
      start: '2025-06-15',
      end: '2025-07-15',
    });
  });
});

describe('bradfordFromAbsenceRanges', () => {
  const w0 = '2025-01-01';
  const w1 = '2025-12-31';

  it('empty ranges', () => {
    expect(bradfordFromAbsenceRanges([], w0, w1)).toEqual({
      spellCount: 0,
      totalDays: 0,
      bradfordScore: 0,
    });
  });

  it('single spell: S=1, D=3, score=3', () => {
    const r = bradfordFromAbsenceRanges([{ start_date: '2025-03-01', end_date: '2025-03-03' }], w0, w1);
    expect(r.spellCount).toBe(1);
    expect(r.totalDays).toBe(3);
    expect(r.bradfordScore).toBe(3);
  });

  it('merges contiguous days into one spell', () => {
    const r = bradfordFromAbsenceRanges(
      [
        { start_date: '2025-03-01', end_date: '2025-03-02' },
        { start_date: '2025-03-03', end_date: '2025-03-05' },
      ],
      w0,
      w1,
    );
    expect(r.spellCount).toBe(1);
    expect(r.totalDays).toBe(5);
    expect(r.bradfordScore).toBe(5);
  });

  it('two separate spells: S=2, D=4, score=16', () => {
    const r = bradfordFromAbsenceRanges(
      [
        { start_date: '2025-03-01', end_date: '2025-03-02' },
        { start_date: '2025-04-10', end_date: '2025-04-11' },
      ],
      w0,
      w1,
    );
    expect(r.spellCount).toBe(2);
    expect(r.totalDays).toBe(4);
    expect(r.bradfordScore).toBe(16);
  });
});
