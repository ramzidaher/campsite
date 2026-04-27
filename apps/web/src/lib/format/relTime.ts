/** Relative time for feed/dashboard list rows (e.g. "2h ago", "Yesterday"). */
export function relTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  // Keep fallback date format deterministic across SSR + hydration.
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(d);
}
