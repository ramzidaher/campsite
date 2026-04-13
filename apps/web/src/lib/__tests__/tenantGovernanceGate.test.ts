import {
  isTenantGovernanceExemptPath,
  resolveTenantGovernanceRedirect,
} from '@/lib/tenantGovernanceGate';

describe('tenantGovernanceGate', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');

  it('exempt paths do not redirect', () => {
    expect(isTenantGovernanceExemptPath('/trial-ended')).toBe(true);
    expect(isTenantGovernanceExemptPath('/trial-ended/foo')).toBe(true);
    expect(isTenantGovernanceExemptPath('/dashboard')).toBe(false);
  });

  it('platform operators bypass', () => {
    expect(
      resolveTenantGovernanceRedirect({
        pathname: '/dashboard',
        isPlatformOperator: true,
        hasOrgId: true,
        orgIsLocked: true,
        orgMaintenanceMode: true,
        orgSubscriptionStatus: 'suspended',
        orgTrialEndsAtIso: '2026-01-01T00:00:00.000Z',
        now,
      }),
    ).toBeNull();
  });

  it('no org id does not redirect', () => {
    expect(
      resolveTenantGovernanceRedirect({
        pathname: '/dashboard',
        isPlatformOperator: false,
        hasOrgId: false,
        orgIsLocked: true,
        orgMaintenanceMode: false,
        orgSubscriptionStatus: null,
        orgTrialEndsAtIso: null,
        now,
      }),
    ).toBeNull();
  });

  it('precedence: locked before maintenance', () => {
    expect(
      resolveTenantGovernanceRedirect({
        pathname: '/x',
        isPlatformOperator: false,
        hasOrgId: true,
        orgIsLocked: true,
        orgMaintenanceMode: true,
        orgSubscriptionStatus: 'active',
        orgTrialEndsAtIso: null,
        now,
      }),
    ).toBe('/org-locked');
  });

  it('maintenance when not locked', () => {
    expect(
      resolveTenantGovernanceRedirect({
        pathname: '/x',
        isPlatformOperator: false,
        hasOrgId: true,
        orgIsLocked: false,
        orgMaintenanceMode: true,
        orgSubscriptionStatus: 'active',
        orgTrialEndsAtIso: null,
        now,
      }),
    ).toBe('/maintenance');
  });

  it('suspended subscription', () => {
    expect(
      resolveTenantGovernanceRedirect({
        pathname: '/x',
        isPlatformOperator: false,
        hasOrgId: true,
        orgIsLocked: false,
        orgMaintenanceMode: false,
        orgSubscriptionStatus: 'suspended',
        orgTrialEndsAtIso: null,
        now,
      }),
    ).toBe('/subscription-suspended');
  });

  it('trial expired', () => {
    expect(
      resolveTenantGovernanceRedirect({
        pathname: '/x',
        isPlatformOperator: false,
        hasOrgId: true,
        orgIsLocked: false,
        orgMaintenanceMode: false,
        orgSubscriptionStatus: 'trial',
        orgTrialEndsAtIso: '2026-06-01T00:00:00.000Z',
        now,
      }),
    ).toBe('/trial-ended');
  });

  it('trial not expired', () => {
    expect(
      resolveTenantGovernanceRedirect({
        pathname: '/x',
        isPlatformOperator: false,
        hasOrgId: true,
        orgIsLocked: false,
        orgMaintenanceMode: false,
        orgSubscriptionStatus: 'trial',
        orgTrialEndsAtIso: '2026-07-01T00:00:00.000Z',
        now,
      }),
    ).toBeNull();
  });
});
