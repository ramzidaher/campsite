/** Hostnames / infra labels that cannot be workspace subdomains (see DB trigger `organisations_reserved_slug_trg`). */
const RESERVED_WORKSPACE_SLUGS = new Set([
  'admin',
  'www',
  'api',
  'app',
  'cdn',
  'static',
  'assets',
  'mail',
  'smtp',
  'ftp',
  'webhooks',
  'webhook',
  'status',
  'health',
  'metrics',
  'staging',
  'preview',
  'deploy',
  'docs',
  'help',
  'support',
  'localhost',
]);

export function isReservedWorkspaceSlug(s: string): boolean {
  return RESERVED_WORKSPACE_SLUGS.has(s.toLowerCase());
}

/** Mirrors `apply_registration_from_user_meta` slug rules for client-side validation and preview. */
export function normalizeWorkspaceSlugInput(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/[^a-z0-9-]+/g, '-');
  s = s.replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  return s;
}

export function isValidWorkspaceSlug(s: string): boolean {
  return (
    s.length >= 2 &&
    s.length <= 63 &&
    /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) &&
    !isReservedWorkspaceSlug(s)
  );
}

/** Suggested invite slug from the display name (kept in sync until the user edits the short name field). */
export function suggestSlugFromOrganisationName(name: string): string {
  return normalizeWorkspaceSlugInput(name.replace(/['\u2019]/g, ''));
}
