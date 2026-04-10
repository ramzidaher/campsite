import { tenantHostMatchesOrg } from '@/lib/tenant/adminUrl';

/** Login URL for candidates with optional next + org preservation (server-side). */
export function buildCandidateJobsLoginRedirectUrl(opts: {
  hostHeader: string | null;
  orgSlug: string | null;
  nextPath?: string;
}): string {
  const params = new URLSearchParams();
  const next = opts.nextPath?.trim() || '/jobs/me';
  params.set('next', next);
  const org = opts.orgSlug?.trim();
  if (org && !tenantHostMatchesOrg(org, opts.hostHeader)) {
    params.set('org', org);
  }
  return `/jobs/login?${params.toString()}`;
}
