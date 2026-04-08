'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/leave',       label: 'Time off',    icon: '🌴' },
  { href: '/performance', label: 'Performance', icon: '⭐' },
  { href: '/onboarding',  label: 'Onboarding',  icon: '✅' },
  { href: '/hr/org-chart', label: 'Org chart', icon: '🧭' },
] as const;

type HrNavProps = {
  showLeave?: boolean;
  showPerformance?: boolean;
  showOnboarding?: boolean;
  showOrgChart?: boolean;
};

export function HrNav({
  showLeave = true,
  showPerformance = true,
  showOnboarding = true,
  showOrgChart = true,
}: HrNavProps) {
  const pathname = usePathname() ?? '';
  const tabs = TABS.filter((tab) => {
    if (tab.href === '/leave') return showLeave;
    if (tab.href === '/performance') return showPerformance;
    if (tab.href === '/onboarding') return showOnboarding;
    if (tab.href === '/hr/org-chart') return showOrgChart;
    return true;
  });
  const active = tabs.find((t) => pathname === t.href || pathname.startsWith(t.href + '/'));

  if (tabs.length <= 1) return null;

  return (
    <nav className="mb-8 flex gap-1 rounded-xl border border-[#e8e8e8] bg-[#faf9f6] p-1">
      {tabs.map((tab) => {
        const isActive = active?.href === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={[
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-[13px] font-medium transition-colors',
              isActive
                ? 'bg-white text-[#121212] shadow-sm'
                : 'text-[#6b6b6b] hover:bg-white/60 hover:text-[#121212]',
            ].join(' ')}
          >
            <span className="text-[14px]">{tab.icon}</span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
