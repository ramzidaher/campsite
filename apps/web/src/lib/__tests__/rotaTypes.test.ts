import {
  canEditRotaShifts,
  canViewRotaDepartmentScope,
  canViewRotaFullOrgGrid,
} from '@campsite/types';

describe('rota view / edit helpers', () => {
  it('department scope for manager and org admins only', () => {
    expect(canViewRotaDepartmentScope('manager')).toBe(true);
    expect(canViewRotaDepartmentScope('org_admin')).toBe(true);
    expect(canViewRotaDepartmentScope('super_admin')).toBe(true);
    expect(canViewRotaDepartmentScope('coordinator')).toBe(false);
    expect(canViewRotaDepartmentScope('csa')).toBe(false);
  });

  it('full org grid for org admins only', () => {
    expect(canViewRotaFullOrgGrid('org_admin')).toBe(true);
    expect(canViewRotaFullOrgGrid('super_admin')).toBe(true);
    expect(canViewRotaFullOrgGrid('manager')).toBe(false);
  });

  it('edit shifts for manager and org admins', () => {
    expect(canEditRotaShifts('manager')).toBe(true);
    expect(canEditRotaShifts('org_admin')).toBe(true);
    expect(canEditRotaShifts('coordinator')).toBe(false);
  });
});
