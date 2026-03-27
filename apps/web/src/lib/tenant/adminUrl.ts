import { HOST_RESOLUTION_CONSTANTS } from '@/lib/middleware/resolveHostRequestContext';

/** Tenant org admin entry (web). Uses `*.localhost` in local dev when the shell host is platform or bare localhost. */
export function tenantAdminDashboardUrl(orgSlug: string): string {
  if (typeof window === 'undefined') {
    return `https://${orgSlug}.${HOST_RESOLUTION_CONSTANTS.ROOT_DOMAIN}/admin`;
  }
  const { protocol, hostname, port } = window.location;
  const p = port ? `:${port}` : '';
  const root = HOST_RESOLUTION_CONSTANTS.ROOT_DOMAIN;
  if (hostname === 'localhost' || hostname === 'admin.localhost' || hostname.endsWith('.localhost')) {
    return `${protocol}//${orgSlug}.localhost${p}/admin`;
  }
  if (hostname.endsWith(`.${root}`)) {
    return `${protocol}//${orgSlug}.${root}${p}/admin`;
  }
  return `${protocol}//${orgSlug}.localhost${p}/admin`;
}
