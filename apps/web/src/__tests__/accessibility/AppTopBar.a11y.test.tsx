import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import type { AnchorHTMLAttributes } from 'react';
import { AppTopBar } from '@/components/shell/AppTopBar';
import { buildShellCommandPaletteSections } from '@/lib/shell/shellCommandPaletteSections';

const testPalette = buildShellCommandPaletteSections({
  orgName: 'Test Org',
  showMyHrRecordNav: false,
  showLeaveNav: false,
  showPerformanceNav: false,
  showOneOnOneNav: false,
  showOnboardingNav: false,
  showApprovalsStandalone: false,
  managerNavSectionLabel: 'Manager',
  managerNavItems: null,
  hrNavItems: null,
  adminNavItems: null,
});

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('next/link', () => {
  return ({ children, href, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  );
});

describe('AppTopBar accessibility', () => {
  it('has no detectable accessibility violations', async () => {
    const { container } = render(
      <AppTopBar
        userInitials="JD"
        notificationCount={2}
        notifications={[
          { id: 'notif-1', label: 'Unread broadcasts', href: '/broadcasts', count: 1 },
          { id: 'notif-2', label: 'Leave requests', href: '/leave', count: 1 },
        ]}
        showMemberSearch={false}
        orgId="org-1"
        orgName="Test Org"
        paletteSections={testPalette}
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
