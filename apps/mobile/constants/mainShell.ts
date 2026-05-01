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
  spacing: {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
  },
  type: {
    title: 20,
    subheading: 15,
    body: 14,
  },
} as const;

/** Shared semantic type styles for mobile screens/components. */
export const mainShellText = {
  pageTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  sectionTitle: {
    fontSize: mainShell.type.title,
    lineHeight: 26,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  subheading: {
    fontSize: mainShell.type.subheading,
    lineHeight: 22,
    fontWeight: '600',
  },
  body: {
    fontSize: mainShell.type.body,
    lineHeight: 20,
  },
  bodyStrong: {
    fontSize: mainShell.type.body,
    lineHeight: 20,
    fontWeight: '600',
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
  },
  tabLabel: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  overline: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
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
    ['broadcast-pending', 'Pending Broadcasts'],
    ['pending-approvals', 'Approvals'],
    ['resources', 'Resource library'],
    ['broadcasts', 'Broadcasts'],
    ['calendar', 'Calendar'],
    ['rota', 'Rota'],
    ['discount-scan', 'Scan a Card'],
    ['discount', 'Discount Card'],
    ['settings', 'Settings'],
  ];
  for (const [key, title] of rules) {
    if (p.includes(key)) return title;
  }
  if (isHomeTabPathname(pathname)) return 'Home';
  return 'Campsite';
}
