import {
  isReportsDescendantInOrg,
  maskManagerForDirectoryRow,
  pendingMemberApproversableByDeptManager,
  profileVisibleUnderDepartmentIsolation,
} from '../departmentIsolationPolicy';

describe('profileVisibleUnderDepartmentIsolation', () => {
  const d1 = 'dept-a';
  const d2 = 'dept-b';
  const u1 = 'user-1';
  const u2 = 'user-2';

  it('always allows self', () => {
    expect(
      profileVisibleUnderDepartmentIsolation({
        viewerId: u1,
        targetId: u1,
        viewerDepartmentIds: new Set(),
        targetDepartmentIds: new Set([d1]),
        isEffectiveOrgAdmin: false,
      }),
    ).toBe(true);
  });

  it('allows org admin bypass', () => {
    expect(
      profileVisibleUnderDepartmentIsolation({
        viewerId: u1,
        targetId: u2,
        viewerDepartmentIds: new Set([d1]),
        targetDepartmentIds: new Set([d2]),
        isEffectiveOrgAdmin: true,
      }),
    ).toBe(true);
  });

  it('denies when no shared department and not admin', () => {
    expect(
      profileVisibleUnderDepartmentIsolation({
        viewerId: u1,
        targetId: u2,
        viewerDepartmentIds: new Set([d1]),
        targetDepartmentIds: new Set([d2]),
        isEffectiveOrgAdmin: false,
      }),
    ).toBe(false);
  });

  it('allows when departments overlap', () => {
    expect(
      profileVisibleUnderDepartmentIsolation({
        viewerId: u1,
        targetId: u2,
        viewerDepartmentIds: new Set([d1, d2]),
        targetDepartmentIds: new Set([d2]),
        isEffectiveOrgAdmin: false,
      }),
    ).toBe(true);
  });
});

describe('isReportsDescendantInOrg', () => {
  const org = new Set(['ceo', 'mgr', 'ic']);

  it('is true along the chain', () => {
    const map = new Map<string, string | null>([
      ['ic', 'mgr'],
      ['mgr', 'ceo'],
      ['ceo', null],
    ]);
    expect(
      isReportsDescendantInOrg({
        orgUserIds: org,
        ancestorId: 'mgr',
        descendantId: 'ic',
        reportsToByUserId: map,
      }),
    ).toBe(true);
  });

  it('is false for peers', () => {
    const map = new Map<string, string | null>([
      ['a', 'mgr'],
      ['b', 'mgr'],
      ['mgr', null],
    ]);
    expect(
      isReportsDescendantInOrg({
        orgUserIds: new Set(['a', 'b', 'mgr']),
        ancestorId: 'a',
        descendantId: 'b',
        reportsToByUserId: map,
      }),
    ).toBe(false);
  });

  it('is false for superiors', () => {
    const map = new Map<string, string | null>([
      ['ic', 'mgr'],
      ['mgr', 'ceo'],
      ['ceo', null],
    ]);
    expect(
      isReportsDescendantInOrg({
        orgUserIds: org,
        ancestorId: 'ic',
        descendantId: 'ceo',
        reportsToByUserId: map,
      }),
    ).toBe(false);
  });

  it('breaks when leaving org', () => {
    const map = new Map<string, string | null>([
      ['ic', 'outsider'],
    ]);
    expect(
      isReportsDescendantInOrg({
        orgUserIds: org,
        ancestorId: 'ceo',
        descendantId: 'ic',
        reportsToByUserId: map,
      }),
    ).toBe(false);
  });
});

describe('maskManagerForDirectoryRow', () => {
  it('strips manager when not visible', () => {
    expect(
      maskManagerForDirectoryRow({
        reportsToUserId: 'mgr',
        reportsToName: 'Boss',
        managerVisible: false,
      }),
    ).toEqual({ reportsToUserId: null, reportsToName: null });
  });

  it('keeps manager when visible', () => {
    expect(
      maskManagerForDirectoryRow({
        reportsToUserId: 'mgr',
        reportsToName: 'Boss',
        managerVisible: true,
      }),
    ).toEqual({ reportsToUserId: 'mgr', reportsToName: 'Boss' });
  });
});

describe('pendingMemberApproversableByDeptManager', () => {
  it('allows org admin or founder', () => {
    expect(
      pendingMemberApproversableByDeptManager({
        pendingUserDepartmentIds: new Set(['d2']),
        viewerManagedDepartmentIds: new Set(['d1']),
        isEffectiveOrgAdmin: true,
        isPlatformFounder: false,
      }),
    ).toBe(true);
    expect(
      pendingMemberApproversableByDeptManager({
        pendingUserDepartmentIds: new Set(['d2']),
        viewerManagedDepartmentIds: new Set(['d1']),
        isEffectiveOrgAdmin: false,
        isPlatformFounder: true,
      }),
    ).toBe(true);
  });

  it('requires managed department overlap otherwise', () => {
    expect(
      pendingMemberApproversableByDeptManager({
        pendingUserDepartmentIds: new Set(['d1']),
        viewerManagedDepartmentIds: new Set(['d1']),
        isEffectiveOrgAdmin: false,
        isPlatformFounder: false,
      }),
    ).toBe(true);
    expect(
      pendingMemberApproversableByDeptManager({
        pendingUserDepartmentIds: new Set(['d2']),
        viewerManagedDepartmentIds: new Set(['d1']),
        isEffectiveOrgAdmin: false,
        isPlatformFounder: false,
      }),
    ).toBe(false);
  });
});
