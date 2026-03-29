const PLATFORM_ADMIN_HOST = 'admin.camp-site.co.uk';
const ROOT_DOMAIN = 'camp-site.co.uk';

export type HostRequestContext = {
  orgSlug: string | null;
  isPlatformAdmin: boolean;
};

/**
 * Tenant subdomain / local dev org slug vs platform-admin host. Pure helper for `middleware.ts` and tests.
 * Platform-admin hostnames never receive an org slug — even `?org=` is ignored so shells do not pick up a tenant by accident.
 */
export function resolveHostRequestContext(
  hostHeader: string | null,
  orgQueryParam: string | null
): HostRequestContext {
  const host = hostHeader ?? '';
  let orgSlug: string | null = null;
  let isPlatformAdmin = false;

  if (host === PLATFORM_ADMIN_HOST || host.startsWith('admin.localhost')) {
    isPlatformAdmin = true;
  } else {
    const hostname = host.split(':')[0] ?? '';
    if (hostname.endsWith(`.${ROOT_DOMAIN}`)) {
      orgSlug = hostname.replace(`.${ROOT_DOMAIN}`, '');
    } else if (hostname.endsWith('.localhost')) {
      orgSlug = hostname.replace('.localhost', '');
    }
  }

  if (!isPlatformAdmin && !orgSlug && orgQueryParam) {
    orgSlug = orgQueryParam;
  }

  return { orgSlug, isPlatformAdmin };
}

export const HOST_RESOLUTION_CONSTANTS = {
  PLATFORM_ADMIN_HOST,
  ROOT_DOMAIN,
} as const;
