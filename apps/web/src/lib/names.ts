export function getDisplayName(fullName: string | null | undefined, preferredName: string | null | undefined): string {
  const legal = (fullName ?? '').trim();
  const preferred = (preferredName ?? '').trim();
  if (!preferred) return legal || 'Unknown';
  if (!legal) return preferred;
  if (preferred.localeCompare(legal, undefined, { sensitivity: 'accent' }) === 0) return legal;
  return `${preferred} (${legal})`;
}

const LETTER = /\p{L}/u;

function firstLetterInToken(token: string): string | null {
  const m = token.match(LETTER);
  return m ? m[0]! : null;
}

function lettersOnly(token: string): string {
  return [...token].filter((ch) => LETTER.test(ch)).join('');
}

/**
 * Avatar-style initials from raw profile fields (not from formatted display strings).
 * Uses Unicode letters only so values like "(Matilda)" or "Ramzi (Legal Name)" never yield "(" or ")".
 */
export function getProfileInitials(fullName: string | null | undefined, preferredName: string | null | undefined): string {
  const legal = (fullName ?? '').trim();
  const preferred = (preferredName ?? '').trim();
  const source = preferred || legal;
  if (!source) return '';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) {
    const letters = lettersOnly(parts[0]!);
    if (!letters) return '';
    return letters.slice(0, 2).toUpperCase();
  }
  const first = firstLetterInToken(parts[0]!);
  const last = firstLetterInToken(parts[parts.length - 1]!);
  if (!first && !last) return '';
  if (!first) return (last ?? '').toUpperCase();
  if (!last) return first.toUpperCase();
  return `${first}${last}`.toUpperCase();
}
