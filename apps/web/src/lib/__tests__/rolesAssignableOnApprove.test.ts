import { rolesAssignableOnApprove } from '@campsite/types';

describe('rolesAssignableOnApprove', () => {
  it('lets org admins assign manager and org_admin', () => {
    const r = rolesAssignableOnApprove('org_admin');
    expect(r).toContain('org_admin');
    expect(r).toContain('manager');
  });

  it('blocks coordinators from choosing org_admin or manager (must match approve_pending_profile RPC)', () => {
    const r = rolesAssignableOnApprove('coordinator');
    expect(r).not.toContain('org_admin');
    expect(r).not.toContain('manager');
    expect(r.length).toBeGreaterThan(0);
  });

  it('blocks managers from choosing org_admin or manager', () => {
    const r = rolesAssignableOnApprove('manager');
    expect(r).not.toContain('org_admin');
    expect(r).not.toContain('manager');
  });
});
