/** Map common PostgREST / Postgres errors to user-facing copy (avoid raw RLS strings in UI). */
export function friendlyDbError(raw: string | null | undefined): string {
  if (!raw?.trim()) return 'Something went wrong. Please try again.';
  const t = raw.toLowerCase();
  if (t.includes('row-level security') || t.includes('rls policy')) {
    return 'You don’t have permission for that. If you’re a department manager, choose a department you manage when creating a rota. Ask an org admin if you need wider access.';
  }
  if (t.includes('jwt') && t.includes('expired')) {
    return 'Your session expired. Refresh the page and sign in again.';
  }
  if (t.includes('duplicate') || t.includes('unique constraint')) {
    return 'That record already exists or conflicts with another row.';
  }
  return raw;
}
