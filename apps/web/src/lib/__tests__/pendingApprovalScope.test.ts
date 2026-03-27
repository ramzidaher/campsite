import { userIdsWithMembershipInDepartments } from '@/lib/admin/pendingApprovalScope';

describe('userIdsWithMembershipInDepartments', () => {
  it('returns empty set when no departments scoped', () => {
    expect(
      userIdsWithMembershipInDepartments(
        [
          { user_id: 'u1', dept_id: 'd1' },
          { user_id: 'u2', dept_id: 'd2' },
        ],
        []
      ).size
    ).toBe(0);
  });

  it('collects users with any membership in the given departments', () => {
    const rows = [
      { user_id: 'pending-a', dept_id: 'd1' },
      { user_id: 'pending-b', dept_id: 'd9' },
      { user_id: 'pending-a', dept_id: 'd2' },
    ];
    const set = userIdsWithMembershipInDepartments(rows, ['d1', 'd2']);
    expect([...set].sort()).toEqual(['pending-a']);
  });
});
