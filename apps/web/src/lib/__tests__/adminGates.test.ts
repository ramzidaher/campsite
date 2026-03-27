import {
  canAccessOrgAdminArea,
  canManageOrgBroadcastsAdmin,
  canManageOrgDepartments,
  canManageOrgSettings,
  canManageOrgUsers,
  getMainShellAdminNavItems,
} from '@/lib/adminGates';

describe('adminGates', () => {
  it('allows org_admin and super_admin into admin area', () => {
    expect(canAccessOrgAdminArea('org_admin')).toBe(true);
    expect(canAccessOrgAdminArea('super_admin')).toBe(true);
  });

  it('denies manager, coordinator, and CSA', () => {
    expect(canAccessOrgAdminArea('manager')).toBe(false);
    expect(canAccessOrgAdminArea('coordinator')).toBe(false);
    expect(canAccessOrgAdminArea('csa')).toBe(false);
  });

  it('maps all canManage* helpers to org admin today', () => {
    expect(canManageOrgUsers('org_admin')).toBe(true);
    expect(canManageOrgDepartments('org_admin')).toBe(true);
    expect(canManageOrgBroadcastsAdmin('org_admin')).toBe(true);
    expect(canManageOrgSettings('org_admin')).toBe(true);
    expect(canManageOrgUsers('manager')).toBe(false);
  });

  it('returns nav items only for org admin', () => {
    expect(getMainShellAdminNavItems('org_admin')?.length).toBeGreaterThan(5);
    expect(getMainShellAdminNavItems('manager')).toBeNull();
  });
});
