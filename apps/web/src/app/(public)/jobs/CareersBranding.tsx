import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  tenantJobsSubrouteRelativePath,
  tenantPublicJobsIndexRelativePath,
} from '@/lib/tenant/adminUrl';

export type CareersSection = 'browse' | 'applications' | 'profile';

// ─── Org mark: logo image or two-letter monogram ─────────────────────────────
function OrgMark({ orgName, logoUrl }: { orgName: string; logoUrl?: string | null }) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        aria-hidden
        width={40}
        height={40}
        className="h-10 w-10 shrink-0 rounded-xl object-contain ring-1 ring-black/[0.07]"
        style={{ background: 'var(--org-brand-surface, #f5f4f1)' }}
      />
    );
  }
  const words = orgName.trim().split(/\s+/);
  const initials =
    words.length >= 2
      ? `${words[0]?.[0] ?? ''}${words[words.length - 1]?.[0] ?? ''}`.toUpperCase()
      : orgName.slice(0, 2).toUpperCase();
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[12px] font-bold tracking-wide"
      style={{
        background: 'var(--org-brand-primary, #121212)',
        color: 'var(--jobs-on-primary, #fff)',
      }}
      aria-hidden
    >
      {initials}
    </div>
  );
}

// ─── Unified branded header ──────────────────────────────────────────────────
type CareersHeaderProps = {
  orgName: string;
  orgLogoUrl?: string | null;
  /** When provided together with hostHeader + current, renders nav tabs */
  orgSlug?: string | null;
  hostHeader?: string;
  current?: CareersSection;
  /** Slot for account/context actions rendered on the right */
  actions?: ReactNode;
};

export function CareersHeader({
  orgName,
  orgLogoUrl,
  orgSlug,
  hostHeader = '',
  current,
  actions,
}: CareersHeaderProps) {
  const showNav = Boolean(orgSlug?.trim()) && Boolean(current);

  return (
    <header
      className="overflow-hidden rounded-2xl border"
      style={{
        borderColor: 'var(--org-brand-border, #e0ddd8)',
        background:
          'linear-gradient(135deg, color-mix(in oklab, var(--org-brand-primary, #121212) 9%, var(--org-brand-surface, #f5f4f1)) 0%, var(--org-brand-surface, #f5f4f1) 55%)',
      }}
    >
      {/* Identity + account row */}
      <div className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <OrgMark orgName={orgName} logoUrl={orgLogoUrl} />
          <div className="min-w-0">
            <p
              className="truncate text-[14px] font-semibold leading-snug"
              style={{ color: 'var(--org-brand-text, #121212)' }}
            >
              {orgName}
            </p>
            <p
              className="text-[11px] font-medium uppercase tracking-[0.1em]"
              style={{ color: 'var(--org-brand-muted, #6b6b6b)' }}
            >
              Careers & Opportunities
            </p>
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-1 text-[13px]">{actions}</div>
        ) : null}
      </div>

      {/* Navigation tabs */}
      {showNav ? (
        <nav
          aria-label="Careers sections"
          className="flex border-t"
          style={{ borderColor: 'var(--org-brand-border, #e0ddd8)' }}
        >
          {(
            [
              {
                id: 'browse' as CareersSection,
                label: 'Open roles',
                path: tenantPublicJobsIndexRelativePath(orgSlug!, hostHeader),
              },
              {
                id: 'applications' as CareersSection,
                label: 'Applications',
                path: tenantJobsSubrouteRelativePath('me', orgSlug!, hostHeader),
              },
              {
                id: 'profile' as CareersSection,
                label: 'Profile',
                path: tenantJobsSubrouteRelativePath('me/profile', orgSlug!, hostHeader),
              },
            ] as const
          ).map((tab) =>
            tab.id === current ? (
              <span
                key={tab.id}
                className="flex-1 border-b-[2.5px] py-3 text-center text-[12.5px] font-semibold"
                style={{
                  borderBottomColor: 'var(--org-brand-primary, #121212)',
                  color: 'var(--org-brand-text, #121212)',
                }}
              >
                {tab.label}
              </span>
            ) : (
              <Link
                key={tab.id}
                href={tab.path}
                className="flex-1 border-b-[2.5px] border-transparent py-3 text-center text-[12.5px] font-medium transition-opacity hover:opacity-70"
                style={{ color: 'var(--org-brand-muted, #6b6b6b)' }}
              >
                {tab.label}
              </Link>
            )
          )}
        </nav>
      ) : null}
    </header>
  );
}

// ─── Jobs index hero ─────────────────────────────────────────────────────────
export function CareersJobsHero({
  orgName,
  description,
  className = '',
}: {
  orgName: string;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`pb-2 pt-8 sm:pt-10 ${className}`}>
      <p
        className="text-[11px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: 'var(--org-brand-muted, #6b6b6b)' }}
      >
        Open opportunities
      </p>
      <h1
        className="mt-2 font-authSerif text-[clamp(2rem,5vw,3rem)] leading-[1.1] tracking-[-0.03em]"
        style={{ color: 'var(--org-brand-text, #121212)' }}
      >
        {orgName}
      </h1>
      {description ? (
        <p
          className="mt-3 max-w-2xl text-[15px] leading-relaxed"
          style={{ color: 'var(--org-brand-muted, #6b6b6b)' }}
        >
          {description}
        </p>
      ) : null}
    </section>
  );
}

// ─── Product strip (footer branding) ─────────────────────────────────────────
export function CareersProductStrip({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 sm:px-5 ${className}`}
      style={{
        borderColor: 'var(--org-brand-border, #e8e6e3)',
        background: 'var(--org-brand-surface, #f5f4f1)',
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p
            className="font-authSerif text-[1.1rem] leading-none"
            style={{ color: 'var(--org-brand-text, #121212)' }}
          >
            Campsite
          </p>
          <p
            className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: 'var(--org-brand-muted, #6b6b6b)' }}
          >
            Careers
          </p>
        </div>
        <p className="text-right text-[11px]" style={{ color: 'var(--org-brand-muted, #6b6b6b)' }}>
          Powered by Common Ground Studios
        </p>
      </div>
    </div>
  );
}
