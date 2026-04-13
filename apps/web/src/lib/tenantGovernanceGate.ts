/**
 * Pure helpers for tenant org governance redirects (founder portal → enforced on main shell).
 */

export const TENANT_GOVERNANCE_EXEMPT_PATHS = [
  '/org-locked',
  '/maintenance',
  '/subscription-suspended',
  '/trial-ended',
] as const;

export type TenantGovernanceExemptPath = (typeof TENANT_GOVERNANCE_EXEMPT_PATHS)[number];

export function isTenantGovernanceExemptPath(pathname: string): boolean {
  const p = pathname.split('?')[0] ?? '';
  return (TENANT_GOVERNANCE_EXEMPT_PATHS as readonly string[]).some(
    (exempt) => p === exempt || p.startsWith(`${exempt}/`),
  );
}

export type TenantGovernanceRedirectInput = {
  pathname: string;
  /** platform_admins row — bypasses tenant blocks */
  isPlatformOperator: boolean;
  hasOrgId: boolean;
  orgIsLocked: boolean;
  orgMaintenanceMode: boolean;
  orgSubscriptionStatus: string | null;
  orgTrialEndsAtIso: string | null;
  now: Date;
};

/**
 * Returns a path to redirect to, or null if the user may proceed.
 * Precedence: locked → maintenance → suspended → expired trial.
 */
export function resolveTenantGovernanceRedirect(input: TenantGovernanceRedirectInput): string | null {
  const pathname = input.pathname.split('?')[0] ?? '';
  if (!input.hasOrgId || input.isPlatformOperator) return null;
  if (isTenantGovernanceExemptPath(pathname)) return null;

  if (input.orgIsLocked) return '/org-locked';
  if (input.orgMaintenanceMode) return '/maintenance';
  if (input.orgSubscriptionStatus === 'suspended') return '/subscription-suspended';

  if (
    input.orgSubscriptionStatus === 'trial' &&
    input.orgTrialEndsAtIso &&
    !Number.isNaN(new Date(input.orgTrialEndsAtIso).getTime()) &&
    new Date(input.orgTrialEndsAtIso).getTime() < input.now.getTime()
  ) {
    return '/trial-ended';
  }

  return null;
}
