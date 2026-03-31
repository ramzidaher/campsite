import {
  getMainShellManagerNavItems,
  getMainShellManagerNavSectionLabel,
} from '@/lib/adminGates';
import {
  isApproverRole,
  isDepartmentWorkspaceRole,
  isManagerRole,
  isOrgAdminRole,
} from '@campsite/types';

const navOpts = { pendingApprovalCount: 0, pendingBroadcastApprovals: 0 };

describe('manager workspace gate (isManagerRole)', () => {
  it('is true only for manager', () => {
    expect(isManagerRole('manager')).toBe(true);
    expect(isManagerRole('coordinator')).toBe(false);
    expect(isManagerRole('org_admin')).toBe(false);
  });

  it('department workspace includes managers and coordinators', () => {
    expect(isDepartmentWorkspaceRole('manager')).toBe(true);
    expect(isDepartmentWorkspaceRole('coordinator')).toBe(true);
    expect(isDepartmentWorkspaceRole('org_admin')).toBe(false);
  });

  it('managers are approvers but not org admins', () => {
    expect(isApproverRole('manager')).toBe(true);
    expect(isOrgAdminRole('manager')).toBe(false);
  });
});

describe('department workspace shell nav', () => {
  it('labels coordinator section Department', () => {
    expect(getMainShellManagerNavSectionLabel('coordinator')).toBe('Department');
    expect(getMainShellManagerNavSectionLabel('manager')).toBe('Manager');
  });

  it('omits overview and sub-teams for coordinators', () => {
    const mgr = getMainShellManagerNavItems('manager', navOpts) ?? [];
    const coord = getMainShellManagerNavItems('coordinator', navOpts) ?? [];
    expect(mgr.some((i) => i.href === '/manager' && i.exact)).toBe(true);
    expect(mgr.some((i) => i.href === '/manager/sub-teams')).toBe(true);
    expect(coord.some((i) => i.href === '/manager')).toBe(false);
    expect(coord.some((i) => i.href === '/manager/sub-teams')).toBe(false);
    expect(coord.some((i) => i.href === '/manager/teams')).toBe(true);
  });
});
