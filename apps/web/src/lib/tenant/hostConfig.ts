/**
 * DNS apex for tenant workspaces: canonical host is `{orgSlug}.{NEXT_PUBLIC_TENANT_ROOT_DOMAIN}`.
 * Override in `.env` for staging domains; production should match Supabase redirect URL wildcards.
 */
export function getTenantRootDomain(): string {
  const v = process.env.NEXT_PUBLIC_TENANT_ROOT_DOMAIN?.trim();
  return v && v.length > 0 ? v : 'camp-site.co.uk';
}

/**
 * Exact hostname for platform admin (Founder HQ). Defaults to `admin.{tenant root}`.
 * Must match DNS and Supabase Auth redirect allowlist for that host.
 */
export function getPlatformAdminHost(): string {
  const v = process.env.NEXT_PUBLIC_PLATFORM_ADMIN_HOST?.trim();
  if (v && v.length > 0) return v;
  return `admin.${getTenantRootDomain()}`;
}
