import Link from 'next/link';
import { CampsiteLogoMark } from '@/components/CampsiteLogoMark';
import type { LucideIcon } from 'lucide-react';

type OrgStateOverlayProps = {
  badge?: string;
  title: string;
  message: string;
  icon: LucideIcon;
  actionHref?: string;
  actionLabel?: string;
  footerText?: string;
  liveMessage?: 'off' | 'polite' | 'assertive';
};

export function OrgStateOverlay({
  badge,
  title,
  message,
  icon: Icon,
  actionHref,
  actionLabel,
  footerText,
  liveMessage = 'off',
}: OrgStateOverlayProps) {
  return (
    <section
      className="fixed inset-0 z-[220] flex items-center justify-center p-4 sm:p-6"
      aria-live={liveMessage}
      aria-atomic="true"
      aria-labelledby="org-state-title"
      aria-describedby="org-state-description"
    >
      <div className="absolute inset-0 bg-black/62 backdrop-blur-2xl" aria-hidden />
      <div
        className="absolute inset-0 opacity-90"
        style={{
          background:
            'radial-gradient(1200px 600px at 50% -10%, color-mix(in srgb, var(--org-brand-accent, #d97706) 24%, transparent), transparent), radial-gradient(1200px 700px at 50% 110%, color-mix(in srgb, var(--org-brand-primary, #1f2937) 20%, transparent), transparent)',
        }}
        aria-hidden
      />
      <div
        className="relative w-full max-w-[560px] rounded-3xl px-6 py-7 text-white shadow-[0_24px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:px-8 sm:py-9"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--org-brand-panel, #111827) 72%, black)',
        }}
      >
        <div className="mx-auto mb-5 flex w-fit items-center gap-2.5 rounded-full bg-white/[0.08] px-3 py-2">
          <CampsiteLogoMark className="h-5 w-5 text-white/90" />
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-white/70">Campsite</span>
        </div>
        {badge ? (
          <div className="mb-4 inline-flex w-fit items-center rounded-full bg-white/[0.1] px-3 py-1 text-xs font-medium uppercase tracking-[0.1em] text-white/80">
            {badge}
          </div>
        ) : null}
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.1] text-white">
          <Icon className="h-7 w-7" aria-hidden />
        </div>
        <h1 id="org-state-title" className="text-center text-2xl font-semibold tracking-tight text-white sm:text-[1.9rem]">
          {title}
        </h1>
        <p id="org-state-description" className="mx-auto mt-4 max-w-[48ch] text-center text-[15px] leading-relaxed text-white/80 sm:text-base">
          {message}
        </p>
        {actionHref && actionLabel ? (
          <p className="mt-7 text-center">
            <Link
              href={actionHref}
              className="inline-flex items-center justify-center rounded-full bg-white/[0.12] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-white/[0.18] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/75 focus-visible:ring-offset-2 focus-visible:ring-offset-black/30"
            >
              {actionLabel}
            </Link>
          </p>
        ) : null}
        {footerText ? <p className="mt-4 text-center text-sm text-white/70">{footerText}</p> : null}
      </div>
    </section>
  );
}
