import {
  canEditRotaShifts,
  canFinalApproveRotaRequests,
  canTransferRotaOwnership,
  canViewRotaDepartmentScope,
  canViewRotaFullOrgGrid,
} from '@campsite/types';

describe('rota view / edit helpers', () => {
  it('department scope for manager, coordinator, and org admins', () => {
    expect(canViewRotaDepartmentScope('manager')).toBe(true);
    expect(canViewRotaDepartmentScope('org_admin')).toBe(true);
    expect(canViewRotaDepartmentScope('super_admin')).toBe(true);
    expect(canViewRotaDepartmentScope('coordinator')).toBe(true);
    expect(canViewRotaDepartmentScope('csa')).toBe(false);
  });

  it('full org grid for org admins only', () => {
    expect(canViewRotaFullOrgGrid('org_admin')).toBe(true);
    expect(canViewRotaFullOrgGrid('super_admin')).toBe(true);
    expect(canViewRotaFullOrgGrid('manager')).toBe(false);
  });

  it('edit shifts for manager, coordinator, and org admins', () => {
    expect(canEditRotaShifts('manager')).toBe(true);
    expect(canEditRotaShifts('org_admin')).toBe(true);
    expect(canEditRotaShifts('coordinator')).toBe(true);
    expect(canEditRotaShifts('duty_manager')).toBe(false);
  });

  it('final rota request approval pool', () => {
    expect(canFinalApproveRotaRequests('manager')).toBe(true);
    expect(canFinalApproveRotaRequests('duty_manager')).toBe(true);
    expect(canFinalApproveRotaRequests('org_admin')).toBe(true);
    expect(canFinalApproveRotaRequests('coordinator')).toBe(false);
  });

  it('transfer ownership org admin only', () => {
    expect(canTransferRotaOwnership('org_admin')).toBe(true);
    expect(canTransferRotaOwnership('manager')).toBe(false);
  });
});
