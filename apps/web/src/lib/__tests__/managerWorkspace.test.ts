import { isApproverRole, isManagerRole, isOrgAdminRole } from '@campsite/types';

describe('manager workspace gate (isManagerRole)', () => {
  it('is true only for manager', () => {
    expect(isManagerRole('manager')).toBe(true);
    expect(isManagerRole('coordinator')).toBe(false);
    expect(isManagerRole('org_admin')).toBe(false);
  });

  it('managers are approvers but not org admins', () => {
    expect(isApproverRole('manager')).toBe(true);
    expect(isOrgAdminRole('manager')).toBe(false);
  });
});
