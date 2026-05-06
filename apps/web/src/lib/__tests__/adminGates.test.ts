import {
  canAccessOrgAdminArea,
  canManageOrgBroadcastsAdmin,
  canManageOrgDepartments,
  canManageOrgSettings,
  canManageOrgUsers,
  getMainShellAdminNavItems,
  getMainShellManagerNavItemsByPermissions,
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

  it('hides manager department workspace links for org admins even when they have the permissions', () => {
    const permissions = ['departments.view', 'teams.view', 'org_chart.view'] as const;
    const orgAdminItems = getMainShellManagerNavItemsByPermissions(permissions, { pendingApprovalCount: 0 }, 'org_admin') ?? [];
    const managerItems = getMainShellManagerNavItemsByPermissions(permissions, { pendingApprovalCount: 0 }, 'manager') ?? [];

    expect(orgAdminItems.some((item) => item.href === '/manager/departments')).toBe(false);
    expect(orgAdminItems.some((item) => item.href === '/manager/teams')).toBe(false);
    expect(orgAdminItems.some((item) => item.href === '/manager/org-chart')).toBe(true);

    expect(managerItems.some((item) => item.href === '/manager/departments')).toBe(true);
    expect(managerItems.some((item) => item.href === '/manager/teams')).toBe(true);
  });
});
