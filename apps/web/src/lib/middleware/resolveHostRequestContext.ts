import { getPlatformAdminHost, getTenantRootDomain } from '@/lib/tenant/hostConfig';

export type HostRequestContext = {
  orgSlug: string | null;
  isPlatformAdmin: boolean;
};

/**
 * Tenant subdomain / local dev org slug vs platform-admin host. Pure helper for `middleware.ts` and tests.
 * Platform-admin hostnames never receive an org slug - even `?org=` is ignored so shells do not pick up a tenant by accident.
 */
export function resolveHostRequestContext(
  hostHeader: string | null,
  orgQueryParam: string | null
): HostRequestContext {
  const host = hostHeader ?? '';
  const hostLower = host.toLowerCase();
  let orgSlug: string | null = null;
  let isPlatformAdmin = false;

  const platformAdminHost = getPlatformAdminHost().toLowerCase();

  if (hostLower.split(':')[0] === platformAdminHost || hostLower.startsWith('admin.localhost')) {
    isPlatformAdmin = true;
  } else {
    const hostname = host.split(':')[0]?.toLowerCase() ?? '';
    const root = getTenantRootDomain().toLowerCase();
    if (hostname.endsWith(`.${root}`)) {
      orgSlug = hostname.replace(`.${root}`, '');
    } else if (hostname.endsWith('.localhost')) {
      orgSlug = hostname.replace('.localhost', '');
    }
  }

  if (!isPlatformAdmin && !orgSlug && orgQueryParam) {
    orgSlug = orgQueryParam;
  }

  return { orgSlug, isPlatformAdmin };
}
