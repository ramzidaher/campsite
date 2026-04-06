'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/leave',       label: 'Time off',    icon: '🌴' },
  { href: '/performance', label: 'Performance', icon: '⭐' },
  { href: '/onboarding',  label: 'Onboarding',  icon: '✅' },
] as const;

export function HrNav() {
  const pathname = usePathname() ?? '';
  const active = TABS.find((t) => pathname === t.href || pathname.startsWith(t.href + '/'));

  return (
    <nav className="mb-8 flex gap-1 rounded-xl border border-[#e8e8e8] bg-[#faf9f6] p-1">
      {TABS.map((tab) => {
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
