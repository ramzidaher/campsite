import { tenantHostMatchesOrg } from '@/lib/tenant/adminUrl';

/** Build `/jobs` URL with filters; preserves `?org=` when the host is not the org subdomain. */
export function buildPublicJobsHref(
  orgSlug: string,
  hostHeader: string | null,
  opts: { q?: string; dept?: string; contract?: string; page?: number }
): string {
  const params = new URLSearchParams();
  if (!tenantHostMatchesOrg(orgSlug, hostHeader)) {
    params.set('org', orgSlug);
  }
  if (opts.q?.trim()) params.set('q', opts.q.trim());
  if (opts.dept?.trim()) params.set('dept', opts.dept.trim());
  if (opts.contract?.trim()) params.set('contract', opts.contract.trim());
  if (opts.page && opts.page > 1) params.set('page', String(opts.page));
  const qs = params.toString();
  return qs ? `/jobs?${qs}` : tenantHostMatchesOrg(orgSlug, hostHeader) ? '/jobs' : `/jobs?org=${encodeURIComponent(orgSlug)}`;
}
