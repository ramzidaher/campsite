'use client';

import { SectionNav, type SectionNavItem } from '@campsite/ui/web';
import { usePathname } from 'next/navigation';

export function HiringHubTabNav({ items }: { items: SectionNavItem[] }) {
  const pathname = usePathname() ?? '';
  if (!items.length) return null;
  return (
    <SectionNav
      className="mt-3"
      items={items}
      pathname={pathname}
      aria-label="Hiring workspace"
      variant="underline"
    />
  );
}
