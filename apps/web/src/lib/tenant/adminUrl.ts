import { HOST_RESOLUTION_CONSTANTS } from '@/lib/middleware/resolveHostRequestContext';

/** Tenant org admin entry (web). Uses `*.localhost` in local dev when the shell host is platform or bare localhost. */
export function tenantAdminDashboardUrl(orgSlug: string): string {
  if (typeof window === 'undefined') {
    return `https://${orgSlug}.${HOST_RESOLUTION_CONSTANTS.ROOT_DOMAIN}/admin`;
  }
  const { protocol, hostname, port } = window.location;
  const p = port ? `:${port}` : '';
  const root = HOST_RESOLUTION_CONSTANTS.ROOT_DOMAIN;
  const platformAdminHost = HOST_RESOLUTION_CONSTANTS.PLATFORM_ADMIN_HOST;
  if (hostname === 'localhost' || hostname === 'admin.localhost' || hostname.endsWith('.localhost')) {
    return `${protocol}//${orgSlug}.localhost${p}/admin`;
  }
  if (hostname === root || hostname === platformAdminHost || hostname === `www.${root}`) {
    return `${protocol}//${orgSlug}.${root}${p}/admin`;
  }
  if (hostname.endsWith(`.${root}`)) {
    return `${protocol}//${orgSlug}.${root}${p}/admin`;
  }
  return `${protocol}//${orgSlug}.localhost${p}/admin`;
}

/** Public job posting URL for the tenant (share off-site). */
export function tenantJobPublicUrl(orgSlug: string, jobSlug: string): string {
  const path = `/jobs/${encodeURIComponent(jobSlug)}`;
  if (typeof window === 'undefined') {
    return `https://${orgSlug}.${HOST_RESOLUTION_CONSTANTS.ROOT_DOMAIN}${path}`;
  }
  const { protocol, hostname, port } = window.location;
  const p = port ? `:${port}` : '';
  const root = HOST_RESOLUTION_CONSTANTS.ROOT_DOMAIN;
  const platformAdminHost = HOST_RESOLUTION_CONSTANTS.PLATFORM_ADMIN_HOST;
  if (hostname === 'localhost' || hostname === 'admin.localhost' || hostname.endsWith('.localhost')) {
    return `${protocol}//${orgSlug}.localhost${p}${path}`;
  }
  if (hostname === root || hostname === platformAdminHost || hostname === `www.${root}`) {
    return `${protocol}//${orgSlug}.${root}${p}${path}`;
  }
  if (hostname.endsWith(`.${root}`)) {
    return `${protocol}//${orgSlug}.${root}${p}${path}`;
  }
  return `${protocol}//${orgSlug}.localhost${p}${path}`;
}
