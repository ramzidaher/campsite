'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

export type AuthOrgDisplay = {
  slug: string | null;
  displayName: string;
  hostLabel: string;
  /** Public org logo (e.g. from `organisations.logo_url`) when on a tenant host. */
  logoUrl?: string | null;
};

function orgInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function AuthOrgCard({ org }: { org: AuthOrgDisplay }) {
  const pathname = usePathname() ?? '';
  const [logoFailed, setLogoFailed] = useState(false);
  /** Plain sign-in / recovery: branding is enough; org context matters on register (`?org=` / host). */
  if (pathname === '/login' || pathname.startsWith('/forgot-password')) {
    return null;
  }
  // On default-domain registration, generic org chrome adds noise.
  // Keep the card only when register is org-scoped (slug present).
  if (pathname.startsWith('/register') && !org.slug) {
    return null;
  }
  const hideChange = pathname.startsWith('/register');
  const initials = orgInitials(org.displayName);
  const showLogo = Boolean(org.logoUrl?.trim()) && !logoFailed;

  return (
    <div
      className={[
        'mb-6 flex min-w-0 items-center gap-3 rounded-2xl border border-neutral-200/90 bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.05)]',
        hideChange ? 'justify-center' : 'justify-between',
      ].join(' ')}
    >
      <div className={['flex min-w-0 items-center gap-3', hideChange ? '' : 'flex-1'].filter(Boolean).join(' ')}>
        {showLogo ? (
          <img
            src={org.logoUrl!.trim()}
            alt=""
            width={44}
            height={44}
            className="h-11 w-11 shrink-0 rounded-xl bg-neutral-50 object-contain ring-1 ring-inset ring-neutral-200/80"
            onError={() => setLogoFailed(true)}
          />
        ) : (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#121212] text-[13px] font-semibold tracking-tight text-white shadow-sm">
            {initials}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold leading-snug tracking-tight text-neutral-900">
            {org.displayName}
          </p>
          <p className="mt-1.5">
            <span className="inline-flex max-w-full items-center rounded-md border border-neutral-200/80 bg-neutral-50 px-2 py-0.5 text-[11px] font-medium leading-tight text-neutral-600">
              <span className="truncate font-mono tabular-nums">{org.hostLabel}</span>
            </span>
          </p>
        </div>
      </div>
      {hideChange ? null : (
        <Link
          href="/register"
          className="shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-neutral-500 underline-offset-2 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
        >
          Change
        </Link>
      )}
    </div>
  );
}
