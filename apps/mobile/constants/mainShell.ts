/** Main app chrome - aligned with web `AppShell` / `AppTopBar`. */
export const mainShell = {
  pageBg: '#faf9f6',
  pageText: '#121212',
  textSecondary: '#6b6b6b',
  textMuted: '#9b9b9b',
  border: '#d8d8d8',
  surface: '#f5f4f1',
  sidebarBg: '#121212',
  sidebarText: '#faf9f6',
  topBarBg: '#faf9f6',
  accentDot: '#E11D48',
} as const;

/** True when the main tab home screen is active (used for personalised header title). */
export function isHomeTabPathname(pathname: string): boolean {
  const p = pathname.toLowerCase();
  return (
    p === '/' ||
    p === '/index' ||
    p.endsWith('/(tabs)') ||
    p.endsWith('/(tabs)/') ||
    p.includes('/(tabs)/index')
  );
}

/** Header title on Home tab: "Hi {first name}" (matches web tone, no comma). */
export function homeHeaderTitle(fullName: string | null | undefined): string {
  const first = fullName?.trim().split(/\s+/).filter(Boolean)[0];
  if (first) return `Hi ${first}`;
  return 'Hi there';
}

/** Map pathname segments to the same titles as web `AppTopBar` `TITLES`. */
export function mainScreenTitle(pathname: string): string {
  const p = pathname.toLowerCase();
  const rules: [string, string][] = [
    ['pending-approvals', 'Approvals'],
    ['broadcasts', 'Broadcasts'],
    ['calendar', 'Calendar'],
    ['rota', 'Rota'],
    ['discount', 'Discount Card'],
    ['settings', 'Settings'],
  ];
  for (const [key, title] of rules) {
    if (p.includes(key)) return title;
  }
  if (isHomeTabPathname(pathname)) return 'Home';
  return 'Campsite';
}
