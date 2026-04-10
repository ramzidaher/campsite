export function getDisplayName(fullName: string | null | undefined, preferredName: string | null | undefined): string {
  const legal = (fullName ?? '').trim();
  const preferred = (preferredName ?? '').trim();
  if (!preferred) return legal || 'Unknown';
  if (!legal) return preferred;
  if (preferred.localeCompare(legal, undefined, { sensitivity: 'accent' }) === 0) return legal;
  return `${preferred} (${legal})`;
}
