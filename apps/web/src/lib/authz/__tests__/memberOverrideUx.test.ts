import {
  buildEffectiveAccessSummary,
  groupPermissionPickerItems,
  permissionPickerMatchesQuery,
} from '@/lib/authz/memberOverrideUx';

describe('memberOverrideUx', () => {
  it('permissionPickerMatchesQuery matches all terms across key, label, description', () => {
    const item = {
      key: 'members.edit_roles',
      label: 'Edit member roles',
      description: 'Assign and update member role assignments.',
    };
    expect(permissionPickerMatchesQuery(item, '')).toBe(true);
    expect(permissionPickerMatchesQuery(item, '  ')).toBe(true);
    expect(permissionPickerMatchesQuery(item, 'edit')).toBe(true);
    expect(permissionPickerMatchesQuery(item, 'roles member')).toBe(true);
    expect(permissionPickerMatchesQuery(item, 'assign role')).toBe(true);
    expect(permissionPickerMatchesQuery(item, 'xyz')).toBe(false);
  });

  it('permissionPickerMatchesQuery tolerates null label/description', () => {
    const malformed = {
      key: 'rota.view',
      label: null,
      description: 'View rota schedules.',
    } as unknown as { key: string; label: string; description: string };
    expect(permissionPickerMatchesQuery(malformed, 'rota')).toBe(true);
  });

  it('groups permissions by key namespace', () => {
    const grouped = groupPermissionPickerItems([
      { key: 'offers.view', label: 'View offers', description: '', is_founder_only: false, assignable_into_custom_role: true },
      { key: 'applications.view', label: 'View applications', description: '', is_founder_only: false, assignable_into_custom_role: true },
      { key: 'offers.manage', label: 'Manage offers', description: '', is_founder_only: false, assignable_into_custom_role: true },
    ]);

    expect(grouped.map((g) => g.group)).toEqual(['Applications', 'Offers']);
    expect(grouped[1]?.items.map((i) => i.key)).toEqual(['offers.manage', 'offers.view']);
  });

  it('computes additive and subtractive preview correctly', () => {
    const summary = buildEffectiveAccessSummary({
      overrideRows: [
        { mode: 'additive', permission_key: 'offers.send_esign' },
        { mode: 'subtractive', permission_key: 'offers.view' },
      ],
      baseRolePermissionKeys: ['offers.view', 'offers.manage'],
      candidatePermissionKeys: ['offers.view', 'offers.manage', 'offers.send_esign'],
    });

    expect(summary.added).toEqual(['offers.send_esign']);
    expect(summary.removed).toEqual(['offers.view']);
    expect(summary.effective).toEqual(['offers.manage', 'offers.send_esign']);
    expect(summary.roleIgnoredByReplace).toBe(false);
  });

  it('marks replace as ignoring role permissions', () => {
    const summary = buildEffectiveAccessSummary({
      overrideRows: [{ mode: 'replace', permission_key: 'applications.view' }],
      baseRolePermissionKeys: ['offers.manage'],
      candidatePermissionKeys: ['offers.manage', 'applications.view'],
    });

    expect(summary.roleIgnoredByReplace).toBe(true);
    expect(summary.effective).toEqual(['applications.view']);
    expect(summary.removed).toEqual(['offers.manage']);
  });
});
