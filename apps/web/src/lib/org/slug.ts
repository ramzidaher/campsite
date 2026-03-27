/** Mirrors `apply_registration_from_user_meta` slug rules for client-side validation and preview. */
export function normalizeWorkspaceSlugInput(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/[^a-z0-9-]+/g, '-');
  s = s.replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  return s;
}

export function isValidWorkspaceSlug(s: string): boolean {
  return s.length >= 2 && s.length <= 63 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s);
}

/** Suggested invite slug from the display name (kept in sync until the user edits the short name field). */
export function suggestSlugFromOrganisationName(name: string): string {
  return normalizeWorkspaceSlugInput(name.replace(/['\u2019]/g, ''));
}
