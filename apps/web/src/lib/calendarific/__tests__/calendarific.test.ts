import { monthDayWindowFromIso } from '@/lib/calendarific/holidayWindow';
import { mapHolidayNameToBuiltin } from '@/lib/calendarific/mapHolidayNameToBuiltin';
import {
  isMissingCalendarificHolidaysCacheError,
  isMissingOrganisationsCelebrationColumnError,
} from '@/lib/calendarific/orgCelebrationDb';

describe('mapHolidayNameToBuiltin', () => {
  it('maps UK-style names', () => {
    expect(mapHolidayNameToBuiltin('Christmas Day')).toBe('christmas');
    expect(mapHolidayNameToBuiltin('Good Friday')).toBe('good_friday');
    expect(mapHolidayNameToBuiltin('Easter Sunday')).toBe('easter');
    expect(mapHolidayNameToBuiltin('Boxing Day')).toBe('boxing_day');
    expect(mapHolidayNameToBuiltin('Guy Fawkes Day')).toBe('bonfire_night');
    expect(mapHolidayNameToBuiltin('Early May Bank Holiday')).toBe('early_may_bank_holiday');
  });

  it('maps US Thanksgiving', () => {
    expect(mapHolidayNameToBuiltin('Thanksgiving Day')).toBe('thanksgiving');
  });

  it('returns null for unknown', () => {
    expect(mapHolidayNameToBuiltin('Random Company Picnic')).toBeNull();
  });
});

describe('isMissingCalendarificHolidaysCacheError', () => {
  it('detects PostgREST schema cache message', () => {
    expect(
      isMissingCalendarificHolidaysCacheError({
        message: "Could not find the table 'public.calendarific_holidays_cache' in the schema cache",
      })
    ).toBe(true);
  });
});

describe('isMissingOrganisationsCelebrationColumnError', () => {
  it('detects Postgres-style missing column messages', () => {
    expect(
      isMissingOrganisationsCelebrationColumnError({
        message: 'column organisations.celebration_holiday_country does not exist',
      })
    ).toBe(true);
  });
});

describe('monthDayWindowFromIso', () => {
  it('builds padded window', () => {
    expect(monthDayWindowFromIso('2026-12-25', 1, 1)).toEqual({
      auto_start_month: 12,
      auto_start_day: 24,
      auto_end_month: 12,
      auto_end_day: 26,
    });
  });

  it('returns null for invalid iso', () => {
    expect(monthDayWindowFromIso('not-a-date', 1, 1)).toBeNull();
  });
});
