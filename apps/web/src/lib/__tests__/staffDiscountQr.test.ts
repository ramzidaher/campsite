import { canVerifyStaffDiscountQr } from '@campsite/types';

describe('canVerifyStaffDiscountQr', () => {
  it('allows org admins, managers, and duty managers', () => {
    expect(canVerifyStaffDiscountQr('org_admin')).toBe(true);
    expect(canVerifyStaffDiscountQr('super_admin')).toBe(true);
    expect(canVerifyStaffDiscountQr('manager')).toBe(true);
    expect(canVerifyStaffDiscountQr('duty_manager')).toBe(true);
  });

  it('denies coordinator, CSA, and administrator', () => {
    expect(canVerifyStaffDiscountQr('coordinator')).toBe(false);
    expect(canVerifyStaffDiscountQr('csa')).toBe(false);
    expect(canVerifyStaffDiscountQr('administrator')).toBe(false);
  });
});
