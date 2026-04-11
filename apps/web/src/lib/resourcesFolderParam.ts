const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** `folder` query: missing = all (grouped); `none` = uncategorised; UUID = that folder. */
export function parseResourcesFolderParam(raw: string | undefined): string | null | 'none' {
  if (raw === undefined || raw === '') return null;
  if (raw === 'none') return 'none';
  if (UUID_RE.test(raw)) return raw;
  return null;
}
