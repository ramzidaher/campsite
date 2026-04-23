import { getTenantRootDomain } from '@/lib/tenant/hostConfig';

function tenantSubdomainOrigin(orgSlug: string): string {
  const root = getTenantRootDomain();
  return `https://${orgSlug}.${root}`;
}

/** Canonical tenant origin, preserving localhost dev host/port when applicable. */
export function tenantSubdomainOriginForHost(orgSlug: string, hostHeader: string | null): string {
  const host = (hostHeader ?? '').trim();
  const [hostnameRaw = '', portRaw] = host.split(':');
  const hostname = hostnameRaw.toLowerCase();
  const port = portRaw?.trim();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    const portSuffix = port ? `:${port}` : '';
    return `http://${orgSlug}.localhost${portSuffix}`;
  }
  return tenantSubdomainOrigin(orgSlug);
}

function isBrowserOnTenantHost(orgSlug: string): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  const root = getTenantRootDomain().toLowerCase();
  return host === `${orgSlug.toLowerCase()}.${root}` || host === `${orgSlug.toLowerCase()}.localhost`;
}

/** True when the request host already identifies this org (subdomain); else callers should add `?org=`. */
export function tenantHostMatchesOrg(orgSlug: string, hostHeader: string | null): boolean {
  const hostname = (hostHeader ?? '').split(':')[0]?.toLowerCase() ?? '';
  const root = getTenantRootDomain().toLowerCase();
  return hostname === `${orgSlug.toLowerCase()}.${root}` || hostname === `${orgSlug.toLowerCase()}.localhost`;
}

/** Public careers index `/jobs` with `?org=` when host is not the tenant subdomain. */
export function tenantPublicJobsIndexRelativePath(
  orgSlug: string | null | undefined,
  hostHeader: string | null
): string {
  const path = '/jobs';
  const o = orgSlug?.trim();
  if (!o) return path;
  if (tenantHostMatchesOrg(o, hostHeader)) return path;
  return `${path}?org=${encodeURIComponent(o)}`;
}

/** Candidate routes under `/jobs/*` (e.g. login, me) with tenant org query when needed. */
export function tenantJobsSubrouteRelativePath(
  segment: 'me' | 'me/profile' | 'login' | 'register' | 'forgot-password',
  orgSlug: string | null | undefined,
  hostHeader: string | null
): string {
  const path = `/jobs/${segment}`;
  const o = orgSlug?.trim();
  if (!o) return path;
  if (tenantHostMatchesOrg(o, hostHeader)) return path;
  return `${path}?org=${encodeURIComponent(o)}`;
}

/** Single application under `/jobs/me/[applicationId]` with org preservation. */
export function tenantJobMeApplicationRelativePath(
  applicationId: string,
  orgSlug: string | null | undefined,
  hostHeader: string | null
): string {
  const path = `/jobs/me/${encodeURIComponent(applicationId)}`;
  const o = orgSlug?.trim();
  if (!o) return path;
  if (tenantHostMatchesOrg(o, hostHeader)) return path;
  return `${path}?org=${encodeURIComponent(o)}`;
}

export function tenantJobListingRelativePath(jobSlug: string, orgSlug: string, hostHeader: string | null): string {
  const path = `/jobs/${encodeURIComponent(jobSlug)}`;
  if (tenantHostMatchesOrg(orgSlug, hostHeader)) return path;
  const join = path.includes('?') ? '&' : '?';
  return `${path}${join}org=${encodeURIComponent(orgSlug)}`;
}

export function tenantJobApplyRelativePath(jobSlug: string, orgSlug: string, hostHeader: string | null): string {
  const path = `/jobs/${encodeURIComponent(jobSlug)}/apply`;
  if (tenantHostMatchesOrg(orgSlug, hostHeader)) return path;
  const join = path.includes('?') ? '&' : '?';
  return `${path}${join}org=${encodeURIComponent(orgSlug)}`;
}

/** Client-only helper for relative links when `hostHeader` is unavailable. */
export function tenantJobListingRelativePathClient(jobSlug: string, orgSlug: string): string {
  const path = `/jobs/${encodeURIComponent(jobSlug)}`;
  if (isBrowserOnTenantHost(orgSlug)) return path;
  const join = path.includes('?') ? '&' : '?';
  return `${path}${join}org=${encodeURIComponent(orgSlug)}`;
}

/** Tenant org admin entry (web). Canonical URL uses the org subdomain in production. */
export function tenantAdminDashboardUrl(orgSlug: string): string {
  const path = '/admin';
  if (typeof window !== 'undefined') {
    if (isBrowserOnTenantHost(orgSlug)) {
      return `${window.location.origin}${path}`;
    }
    return `${tenantSubdomainOrigin(orgSlug)}${path}`;
  }
  return `${tenantSubdomainOrigin(orgSlug)}${path}`;
}

/** Public job posting URL for the tenant (share off-site). */
export function tenantJobPublicUrl(orgSlug: string, jobSlug: string): string {
  const path = `/jobs/${encodeURIComponent(jobSlug)}`;
  if (typeof window !== 'undefined') {
    if (isBrowserOnTenantHost(orgSlug)) {
      return `${window.location.origin}${path}`;
    }
    return `${tenantSubdomainOrigin(orgSlug)}${path}`;
  }
  return `${tenantSubdomainOrigin(orgSlug)}${path}`;
}
