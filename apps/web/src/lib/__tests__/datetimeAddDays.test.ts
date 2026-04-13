import { addDays, startOfDayLocal } from '@/lib/datetime';

describe('addDays / startOfDayLocal', () => {
  it('addDays advances the calendar date', () => {
    const d = new Date(2026, 3, 10, 15, 30, 0);
    const n = addDays(d, 4);
    expect(n.getFullYear()).toBe(2026);
    expect(n.getMonth()).toBe(3);
    expect(n.getDate()).toBe(14);
    expect(n.getHours()).toBe(15);
  });

  it('startOfDayLocal clears time fields', () => {
    const d = new Date(2026, 0, 2, 22, 1, 2);
    const s = startOfDayLocal(d);
    expect(s.getHours()).toBe(0);
    expect(s.getMinutes()).toBe(0);
    expect(s.getDate()).toBe(2);
  });
});
