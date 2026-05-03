import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { headers } from 'next/headers';

function getPublicBackLink(pathname: string): { href: string; label: string } | null {
  const clean = pathname.split('?')[0] ?? pathname;
  if (!clean) return null;
  if (/^\/jobs\/[^/]+\/apply$/.test(clean)) return { href: clean.replace(/\/apply$/, ''), label: 'Role' };
  if (/^\/jobs\/[^/]+$/.test(clean)) return { href: '/jobs', label: 'Open roles' };
  if (/^\/jobs\/me\/[^/]+$/.test(clean)) return { href: '/jobs/me', label: 'My applications' };
  if (clean === '/jobs/forgot-password') return { href: '/jobs/login', label: 'Sign in' };
  return null;
}

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get('x-campsite-pathname') ?? '';
  const backLink = getPublicBackLink(pathname);
  return (
    <main id="main-content" tabIndex={-1} className="public-fluid">
      {backLink ? (
        <div className="mx-auto w-full max-w-6xl px-4 pt-3 sm:px-6 lg:px-8">
          <Link
            href={backLink.href}
            prefetch={false}
            className="group inline-flex items-center gap-1 text-[13px] font-medium text-[#6b6b6b] underline-offset-2 hover:text-[#121212] hover:underline"
          >
            <ChevronLeft
              className="h-3.5 w-3.5 shrink-0 opacity-70 transition-opacity group-hover:opacity-100"
              aria-hidden
              strokeWidth={2}
            />
            {backLink.label}
          </Link>
        </div>
      ) : null}
      {children}
    </main>
  );
}
