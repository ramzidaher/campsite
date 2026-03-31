import { randomUUID } from 'crypto';

const MAX_BASE_LEN = 56;

/** URL-safe slug segment from title; empty yields `role`. */
export function slugifyJobTitle(title: string): string {
  const t = title.trim().toLowerCase();
  const s = t
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const base = s.slice(0, MAX_BASE_LEN).replace(/-+$/g, '') || 'role';
  return base;
}

/** Public slug: slugified title + short random suffix (avoids collisions per org). */
export function generatePublishedJobSlug(title: string): string {
  const base = slugifyJobTitle(title);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}

export function generateDraftJobSlug(): string {
  return `draft-${randomUUID().replace(/-/g, '')}`;
}
