'use client';

import Link from 'next/link';
import React from 'react';

export type SectionNavItem = {
  href: string;
  label: string;
  badge?: number;
};

export type SectionNavProps = {
  items: SectionNavItem[];
  pathname: string;
  'aria-label'?: string;
  className?: string;
  /** `underline` — text tabs with a bottom rule (hiring hub). Default `pill` matches HR workspace chips. */
  variant?: 'pill' | 'underline';
};

function isActive(pathname: string, href: string): boolean {
  if (href === '/hr') return pathname === '/hr';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SectionNav({
  items,
  pathname,
  'aria-label': ariaLabel = 'Section',
  className,
  variant = 'pill',
}: SectionNavProps) {
  if (variant === 'underline') {
    return (
      <nav
        aria-label={ariaLabel}
        className={['flex flex-wrap gap-x-6 gap-y-1 border-b border-[#e8e8e8]', className].filter(Boolean).join(' ')}
      >
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className={[
                '-mb-px inline-flex items-center gap-2 border-b-2 pb-3 text-[13px] font-medium transition-colors',
                active ? 'border-[#121212] text-[#121212]' : 'border-transparent text-[#6b6b6b] hover:text-[#121212]',
              ].join(' ')}
            >
              <span>{item.label}</span>
              {typeof item.badge === 'number' && item.badge > 0 ? (
                <span className="inline-flex min-w-[1.25rem] justify-center rounded-full bg-[#b91c1c] px-1.5 text-[10px] font-bold leading-4 text-white">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      aria-label={ariaLabel}
      className={['flex flex-wrap gap-2', className].filter(Boolean).join(' ')}
    >
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            className={[
              'rounded-xl border px-3 py-2 text-left text-[12.5px] font-medium leading-snug transition-colors',
              active
                ? 'border-[#d8d8d8] bg-[#faf9f6] text-[#121212]'
                : 'border-transparent bg-transparent text-[#6b6b6b] hover:bg-[#faf9f6]',
            ].join(' ')}
          >
            <span className="inline-flex max-w-[13rem] flex-col sm:max-w-none">
              <span>{item.label}</span>
              {typeof item.badge === 'number' && item.badge > 0 ? (
                <span className="mt-0.5 inline-flex w-fit min-w-[1.25rem] justify-center rounded-full bg-[#b91c1c] px-1.5 text-[10px] font-bold leading-4 text-white">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              ) : null}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
