'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items: { href: string; label: string; exact?: boolean }[] = [
  { href: '/manager', label: 'Overview', exact: true },
  { href: '/pending-approvals', label: 'Pending members' },
  { href: '/broadcasts', label: 'Broadcasts' },
  { href: '/rota', label: 'Department rota' },
];

function navLinkClass(active: boolean) {
  return [
    'block rounded-lg px-2.5 py-2 text-[13px] transition-colors',
    active
      ? 'bg-white font-medium text-[#121212] shadow-sm ring-1 ring-[#d8d8d8]'
      : 'text-[#6b6b6b] hover:bg-white/70 hover:text-[#121212]',
  ].join(' ');
}

export function ManagerNav() {
  const pathname = usePathname() ?? '';

  return (
    <aside className="w-full shrink-0 md:w-[200px]">
      <nav
        className="rounded-xl border border-[#d8d8d8] bg-[#f5f4f1] p-2"
        aria-label="Manager"
      >
        <p className="mb-2 px-2.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9b9b9b]">
          Manager
        </p>
        <div className="space-y-0.5">
          {items.map(({ href, label, exact }) => {
            const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link key={href} href={href} className={navLinkClass(active)}>
                {label}
              </Link>
            );
          })}
        </div>
        <Link
          href="/broadcasts"
          className="mt-4 block px-2.5 py-2 text-[12px] text-[#9b9b9b] transition-colors hover:text-[#121212]"
        >
          ← App home
        </Link>
      </nav>
    </aside>
  );
}
