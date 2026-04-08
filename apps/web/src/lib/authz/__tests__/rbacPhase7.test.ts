import { validateCustomRolePermissionKeys } from '@/lib/authz/validateCustomRolePermissions';
import type { PermissionPickerItem } from '@/lib/authz/customRolePickerContract';
import { actorCanAssignRole, type RankedOrgRole } from '../rankAssignmentPolicy';
import { effectivePermissionWithOverrides } from '../overrideComposition';
import { actorMayManageUserPermissionOverrides } from '../permissionOverrideGate';
import {
  isReportsDescendantInOrg,
  profileVisibleUnderDepartmentIsolation,
} from '../departmentIsolationPolicy';

describe('Phase 7 — org admin vs department isolation (pure mirror)', () => {
  const dx = 'dept-x';
  const dy = 'dept-y';
  const ua = 'user-a';
  const ub = 'user-b';

  it('org admin can see targets in any department', () => {
    expect(
      profileVisibleUnderDepartmentIsolation({
        viewerId: ua,
        targetId: ub,
        viewerDepartmentIds: new Set([dx]),
        targetDepartmentIds: new Set([dy]),
        isEffectiveOrgAdmin: true,
      }),
    ).toBe(true);
  });

  it('user in department X cannot see a peer only in department Y', () => {
    expect(
      profileVisibleUnderDepartmentIsolation({
        viewerId: ua,
        targetId: ub,
        viewerDepartmentIds: new Set([dx]),
        targetDepartmentIds: new Set([dy]),
        isEffectiveOrgAdmin: false,
      }),
    ).toBe(false);
  });
});

describe('Phase 7 — permission overrides gate (manager vs peer / superior)', () => {
  const org = new Set(['mgr', 'ic', 'peer', 'ceo']);
  const chain = new Map<string, string | null>([
    ['ic', 'mgr'],
    ['peer', 'mgr'],
    ['mgr', 'ceo'],
    ['ceo', null],
  ]);

  it('allows org admin to manage anyone', () => {
    expect(
      actorMayManageUserPermissionOverrides({
        actorId: 'mgr',
        targetUserId: 'ceo',
        isEffectiveOrgAdmin: true,
        orgUserIds: org,
        reportsToByUserId: chain,
      }),
    ).toBe(true);
  });

  it('allows manager to manage a direct report', () => {
    expect(
      actorMayManageUserPermissionOverrides({
        actorId: 'mgr',
        targetUserId: 'ic',
        isEffectiveOrgAdmin: false,
        orgUserIds: org,
        reportsToByUserId: chain,
      }),
    ).toBe(true);
  });

  it('denies manager mutating a peer (same manager)', () => {
    expect(
      actorMayManageUserPermissionOverrides({
        actorId: 'ic',
        targetUserId: 'peer',
        isEffectiveOrgAdmin: false,
        orgUserIds: org,
        reportsToByUserId: chain,
      }),
    ).toBe(false);
  });

  it('denies IC mutating superior chain', () => {
    expect(
      actorMayManageUserPermissionOverrides({
        actorId: 'ic',
        targetUserId: 'mgr',
        isEffectiveOrgAdmin: false,
        orgUserIds: org,
        reportsToByUserId: chain,
      }),
    ).toBe(false);
  });

  it('isReportsDescendantInOrg matches superior/descendant intent', () => {
    expect(
      isReportsDescendantInOrg({
        orgUserIds: org,
        ancestorId: 'mgr',
        descendantId: 'ic',
        reportsToByUserId: chain,
      }),
    ).toBe(true);
    expect(
      isReportsDescendantInOrg({
        orgUserIds: org,
        ancestorId: 'ic',
        descendantId: 'mgr',
        reportsToByUserId: chain,
      }),
    ).toBe(false);
  });
});

describe('Phase 7 — role rank: cannot assign above own level', () => {
  const senior: RankedOrgRole = { id: '1', key: 'senior', rank_level: 40, rank_order: 10 };
  const junior: RankedOrgRole = { id: '2', key: 'junior', rank_level: 30, rank_order: 5 };
  const sameBandLower: RankedOrgRole = { id: '3', key: 'alt', rank_level: 40, rank_order: 20 };
  const orgAdminTarget: RankedOrgRole = { id: '4', key: 'org_admin', rank_level: 99, rank_order: 0 };

  it('platform founder bypass', () => {
    expect(
      actorCanAssignRole({
        actorIsPlatformFounder: true,
        actorAssignedRoles: [junior],
        targetRole: senior,
      }),
    ).toBe(true);
  });

  it('assigns strictly junior band from senior band', () => {
    expect(
      actorCanAssignRole({
        actorIsPlatformFounder: false,
        actorAssignedRoles: [senior],
        targetRole: junior,
      }),
    ).toBe(true);
  });

  it('denies assigning a higher band', () => {
    expect(
      actorCanAssignRole({
        actorIsPlatformFounder: false,
        actorAssignedRoles: [junior],
        targetRole: senior,
      }),
    ).toBe(false);
  });

  it('denies same band when target rank_order is higher', () => {
    expect(
      actorCanAssignRole({
        actorIsPlatformFounder: false,
        actorAssignedRoles: [senior],
        targetRole: sameBandLower,
      }),
    ).toBe(false);
  });

  it('org_admin role assignable only by org_admin holder', () => {
    expect(
      actorCanAssignRole({
        actorIsPlatformFounder: false,
        actorAssignedRoles: [junior],
        targetRole: orgAdminTarget,
      }),
    ).toBe(false);
    expect(
      actorCanAssignRole({
        actorIsPlatformFounder: false,
        actorAssignedRoles: [orgAdminTarget, junior],
        targetRole: orgAdminTarget,
      }),
    ).toBe(true);
  });
});

describe('Phase 7 — permission overrides composition (no bleed)', () => {
  const role = new Set(['broadcasts.view', 'members.view']);

  it('subtractive removes an otherwise granted role grant', () => {
    expect(
      effectivePermissionWithOverrides({
        permissionKey: 'broadcasts.view',
        roleGrantedKeys: role,
        overrideRows: [{ mode: 'subtractive', permission_key: 'broadcasts.view' }],
      }),
    ).toBe(false);
  });

  it('additive stacks on top of role', () => {
    expect(
      effectivePermissionWithOverrides({
        permissionKey: 'roles.view',
        roleGrantedKeys: role,
        overrideRows: [{ mode: 'additive', permission_key: 'roles.view' }],
      }),
    ).toBe(true);
  });

  it('replace mode ignores base role grants not in allowlist', () => {
    expect(
      effectivePermissionWithOverrides({
        permissionKey: 'members.view',
        roleGrantedKeys: role,
        overrideRows: [{ mode: 'replace', permission_key: 'leave.view_own' }],
      }),
    ).toBe(false);
    expect(
      effectivePermissionWithOverrides({
        permissionKey: 'leave.view_own',
        roleGrantedKeys: role,
        overrideRows: [{ mode: 'replace', permission_key: 'leave.view_own' }],
      }),
    ).toBe(true);
  });

  it('restricted replace allowlist does not expose unrelated role capabilities', () => {
    const wideRole = new Set(['departments.view', 'broadcasts.manage', 'members.view']);
    const rows = [
      { mode: 'replace' as const, permission_key: 'broadcasts.view' },
      { mode: 'replace' as const, permission_key: 'leave.view_own' },
    ];
    expect(
      effectivePermissionWithOverrides({
        permissionKey: 'departments.view',
        roleGrantedKeys: wideRole,
        overrideRows: rows,
      }),
    ).toBe(false);
    expect(
      effectivePermissionWithOverrides({
        permissionKey: 'broadcasts.view',
        roleGrantedKeys: wideRole,
        overrideRows: rows,
      }),
    ).toBe(true);
  });

  it('additive still applies when replace mode is active', () => {
    expect(
      effectivePermissionWithOverrides({
        permissionKey: 'jobs.view',
        roleGrantedKeys: new Set(),
        overrideRows: [
          { mode: 'replace', permission_key: 'broadcasts.view' },
          { mode: 'additive', permission_key: 'jobs.view' },
        ],
      }),
    ).toBe(true);
  });
});

describe('Phase 7 — custom role picker ceiling', () => {
  const items: PermissionPickerItem[] = [
    {
      key: 'a.x',
      label: 'A',
      description: '',
      is_founder_only: false,
      assignable_into_custom_role: true,
    },
    {
      key: 'b.y',
      label: 'B',
      description: '',
      is_founder_only: false,
      assignable_into_custom_role: false,
    },
  ];

  it('rejects keys the viewer cannot assign into custom roles', () => {
    const v = validateCustomRolePermissionKeys(['a.x', 'b.y'], items);
    expect(v.ok).toBe(false);
  });

  it('accepts a subset of assignable keys', () => {
    const v = validateCustomRolePermissionKeys(['a.x'], items);
    expect(v.ok).toBe(true);
  });
});
