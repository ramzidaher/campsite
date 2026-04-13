import {
  canAccessOrgAdminArea,
  canManageOrgBroadcastsAdmin,
  canManageOrgDepartments,
  canManageOrgSettings,
  canManageOrgUsers,
  getMainShellAdminNavItems,
} from '@/lib/adminGates';

describe('adminGates', () => {
  it('disables deprecated role-based admin access checks', () => {
    expect(canAccessOrgAdminArea('org_admin')).toBe(false);
    expect(canAccessOrgAdminArea('super_admin')).toBe(false);
    expect(canAccessOrgAdminArea('manager')).toBe(false);
    expect(canAccessOrgAdminArea('coordinator')).toBe(false);
    expect(canAccessOrgAdminArea('csa')).toBe(false);
  });

  it('keeps deprecated canManage* helpers disabled', () => {
    expect(canManageOrgUsers('org_admin')).toBe(false);
    expect(canManageOrgDepartments('org_admin')).toBe(false);
    expect(canManageOrgBroadcastsAdmin('org_admin')).toBe(false);
    expect(canManageOrgSettings('org_admin')).toBe(false);
    expect(canManageOrgUsers('manager')).toBe(false);
  });

  it('disables legacy role-based admin nav builder', () => {
    expect(getMainShellAdminNavItems('org_admin')).toBeNull();
    expect(getMainShellAdminNavItems('manager')).toBeNull();
  });
});
