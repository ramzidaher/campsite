import * as React from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { AuthOrgCard, type AuthOrgDisplay } from '@/components/auth/AuthOrgCard';
import { CampsiteLogoMark } from '@/components/CampsiteLogoMark';
import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';

function titleCaseSlug(s: string) {
  return s
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function getAuthBackLink(pathname: string): { href: string; label: string } | null {
  const clean = pathname.split('?')[0] ?? pathname;
  if (clean === '/forgot-password') return { href: '/login', label: 'Sign in' };
  if (clean === '/register/done') return { href: '/login', label: 'Sign in' };
  return null;
}

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const slug = h.get('x-campsite-org-slug');
  const hostRaw = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const hostLabel = hostRaw.split(':')[0] || 'camp-site.co.uk';

  let orgName: string | null = null;
  let orgLogoUrl: string | null = null;
  if (slug) {
    try {
      const supabase = await createClient();
      const { data } = await supabase
        .from('organisations')
        .select('name, logo_url')
        .eq('slug', slug)
        .eq('is_active', true)
        .maybeSingle();
      orgName = (data?.name as string | undefined) ?? null;
      const rawLogo = (data as { logo_url?: string | null } | null)?.logo_url;
      orgLogoUrl = typeof rawLogo === 'string' && rawLogo.trim() ? rawLogo.trim() : null;
    } catch {
      orgName = null;
      orgLogoUrl = null;
    }
  }

  const displayName = orgName ?? (slug ? titleCaseSlug(slug) : 'Campsite');
  const pathname = h.get('x-campsite-pathname') ?? '';
  const backLink = getAuthBackLink(pathname);

  const org: AuthOrgDisplay = {
    slug,
    displayName,
    hostLabel,
    logoUrl: orgLogoUrl,
  };

  return (
    <div className="auth-shell flex min-h-screen w-full">
      <aside className="relative hidden w-full max-w-[420px] shrink-0 flex-col overflow-hidden bg-[#121212] px-10 py-12 text-[#faf9f6] lg:flex">
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-[300px] w-[300px] rounded-full border border-white/[0.07]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-16 -left-16 h-[260px] w-[260px] rounded-full border border-white/[0.05]"
          aria-hidden
        />

        <Link href="/" className="relative z-[1] mb-auto flex items-center gap-2.5">
          <CampsiteLogoMark className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-[10px] bg-white/[0.12]" />
          <span className="font-authSerif text-[22px] tracking-tight text-[#faf9f6]">Campsite</span>
        </Link>

        <div className="relative z-[1] flex flex-1 flex-col justify-center py-10">
          <h1 className="font-authSerif text-[38px] leading-[1.2] text-[#faf9f6]">
            Your team,
            <br />
            <em className="text-[#e8622a]">connected</em> and
            <br />
            organised.
          </h1>
          <p className="mt-4 max-w-[280px] text-sm leading-relaxed text-white/50">
            The internal communications platform for teams and organisations.
          </p>
          <ul className="mt-10 flex flex-col gap-3 text-[13px] text-white/[0.65]">
            {[
              'Broadcast messages to departments',
              'Manage rotas and schedules',
              'Smart calendar sync',
            ].map((line) => (
              <li key={line} className="flex items-center gap-3">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/30" aria-hidden />
                {line}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-[1] mt-8 text-[11px] text-white/25">
          © {new Date().getFullYear()} Common Ground Studios Ltd
        </p>
      </aside>

      <main
        id="main-content"
        tabIndex={-1}
        className="campsite-paper auth-shell-main flex min-h-screen flex-1 items-start justify-center overflow-y-auto px-6 py-10 sm:px-8 sm:py-12 lg:items-center"
      >
        <div className="w-full max-w-[460px]">
          <Link href="/" className="mb-6 flex items-center gap-2.5 lg:hidden">
            <CampsiteLogoMark className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-[10px] bg-[#121212]" />
            <span className="font-authSerif text-xl tracking-tight text-[#121212]">Campsite</span>
          </Link>
          {backLink ? (
            <Link
              href={backLink.href}
              prefetch={false}
              className="group mb-5 inline-flex items-center gap-1 text-[13px] font-medium text-[#6b6b6b] underline-offset-2 hover:text-[#121212] hover:underline"
            >
              <ChevronLeft
                className="h-3.5 w-3.5 shrink-0 opacity-70 transition-opacity group-hover:opacity-100"
                aria-hidden
                strokeWidth={2}
              />
              {backLink.label}
            </Link>
          ) : null}
          <AuthOrgCard org={org} />
          {children}
        </div>
      </main>
    </div>
  );
}
