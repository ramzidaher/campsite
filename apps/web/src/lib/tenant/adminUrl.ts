import { HOST_RESOLUTION_CONSTANTS } from '@/lib/middleware/resolveHostRequestContext';

function withOrg(path: string, orgSlug: string): string {
  const join = path.includes('?') ? '&' : '?';
  return `${path}${join}org=${encodeURIComponent(orgSlug)}`;
}

/** Tenant org admin entry (web). Uses `*.localhost` in local dev when the shell host is platform or bare localhost. */
export function tenantAdminDashboardUrl(orgSlug: string): string {
  const path = withOrg('/admin', orgSlug);
  if (typeof window === 'undefined') {
    return `https://${HOST_RESOLUTION_CONSTANTS.ROOT_DOMAIN}${path}`;
  }
  return `${window.location.origin}${path}`;
}

/** Public job posting URL for the tenant (share off-site). */
export function tenantJobPublicUrl(orgSlug: string, jobSlug: string): string {
  const path = withOrg(`/jobs/${encodeURIComponent(jobSlug)}`, orgSlug);
  if (typeof window === 'undefined') {
    return `https://${HOST_RESOLUTION_CONSTANTS.ROOT_DOMAIN}${path}`;
  }
  return `${window.location.origin}${path}`;
}
