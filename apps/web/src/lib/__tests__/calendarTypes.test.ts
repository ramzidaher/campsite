import { canManageCalendarManualEvents } from '@campsite/types';

describe('canManageCalendarManualEvents', () => {
  it('allows managers and org admins (including legacy super_admin)', () => {
    expect(canManageCalendarManualEvents('manager')).toBe(true);
    expect(canManageCalendarManualEvents('org_admin')).toBe(true);
    expect(canManageCalendarManualEvents('super_admin')).toBe(true);
  });

  it('denies members who only edit their own rows via broadcast insert policy', () => {
    expect(canManageCalendarManualEvents('coordinator')).toBe(false);
    expect(canManageCalendarManualEvents('csa')).toBe(false);
    expect(canManageCalendarManualEvents('administrator')).toBe(false);
  });
});
