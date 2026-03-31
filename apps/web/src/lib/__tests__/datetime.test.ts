import { formatShiftTimeRange, safeTimeZoneOptions } from '@/lib/datetime';

describe('datetime org timezone helpers', () => {
  it('safeTimeZoneOptions returns empty for invalid IANA', () => {
    expect(safeTimeZoneOptions('Not/AZone')).toEqual({});
  });

  it('safeTimeZoneOptions returns timeZone for Europe/London', () => {
    expect(safeTimeZoneOptions('Europe/London')).toEqual({ timeZone: 'Europe/London' });
  });

  it('formatShiftTimeRange formats a range', () => {
    const s = formatShiftTimeRange('2026-06-01T09:00:00.000Z', '2026-06-01T17:00:00.000Z', null);
    expect(s).toContain('-');
    expect(s.length).toBeGreaterThan(4);
  });
});
