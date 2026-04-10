import { buildEffectiveAccessSummary, groupPermissionPickerItems } from '@/lib/authz/memberOverrideUx';

describe('memberOverrideUx', () => {
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
