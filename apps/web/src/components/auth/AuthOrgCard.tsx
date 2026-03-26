'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type AuthOrgDisplay = {
  slug: string | null;
  displayName: string;
  hostLabel: string;
};

function orgInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function AuthOrgCard({ org }: { org: AuthOrgDisplay }) {
  const pathname = usePathname() ?? '';
  const hideChange = pathname.startsWith('/register');
  const initials = orgInitials(org.displayName);

  return (
    <div className="mb-5 flex items-center gap-2.5 rounded-[10px] border border-[#d8d8d8] bg-[#f5f4f1] px-3.5 py-2.5">
      <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[7px] bg-[#121212] text-xs font-semibold text-white">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-[#121212]">{org.displayName}</div>
        <div className="truncate text-[11.5px] text-[#9b9b9b]">{org.hostLabel}</div>
      </div>
      {hideChange ? null : (
        <Link
          href="/register"
          className="shrink-0 rounded-md px-2 py-1 text-xs text-[#9b9b9b] transition-colors hover:bg-[#d8d8d8] hover:text-[#121212]"
        >
          Change
        </Link>
      )}
    </div>
  );
}
