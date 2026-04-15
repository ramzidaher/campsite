import type { ReactNode } from 'react';

/** Campsite + Careers + Common Ground Studios — use at the top of every public careers route. */
export function CareersProductStrip({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded-2xl border px-5 py-4 sm:px-6 ${className}`}
      style={{
        borderColor: 'color-mix(in oklab, var(--org-brand-primary, #121212) 40%, black 60%)',
        background:
          'linear-gradient(180deg, color-mix(in oklab, var(--org-brand-primary, #121212) 92%, white 8%), color-mix(in oklab, var(--org-brand-primary, #121212) 84%, black 16%))',
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="font-authSerif text-[1.35rem] leading-none tracking-tight sm:text-[1.5rem]"
            style={{ color: 'var(--jobs-on-primary, #faf9f6)' }}
          >
            Campsite
          </span>
          <span
            className="hidden h-5 w-px sm:block"
            aria-hidden
            style={{ background: 'color-mix(in oklab, var(--jobs-on-primary, #faf9f6) 25%, transparent)' }}
          />
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em]"
            style={{
              background: 'color-mix(in oklab, var(--org-brand-accent, #d4af37) 88%, white 12%)',
              color: 'var(--org-brand-primary, #121212)',
            }}
          >
            Careers
          </span>
        </div>
        <p
          className="text-[12px] leading-snug sm:text-right"
          style={{ color: 'color-mix(in oklab, var(--jobs-on-primary, #faf9f6) 72%, transparent)' }}
        >
          Hiring platform by <span className="font-semibold">Common Ground Studios Ltd</span>
        </p>
      </div>
    </div>
  );
}

/** Large org block — job index hero and anywhere the employer should read as the main context. */
export function CareersOrgHero({
  orgName,
  description,
  trailing,
  className = '',
}: {
  orgName: string;
  description?: ReactNode;
  /** e.g. account links — laid out to the right on wide screens */
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`mt-5 overflow-hidden rounded-2xl border ${className}`}
      style={{
        borderColor: 'color-mix(in oklab, var(--org-brand-primary, #121212) 45%, black 55%)',
        background:
          'linear-gradient(145deg, color-mix(in oklab, var(--org-brand-primary, #121212) 92%, white 8%), color-mix(in oklab, var(--org-brand-secondary, #2f2f2f) 88%, black 12%))',
      }}
    >
      <div
        className="border-b px-5 pb-1 pt-5 sm:px-7 sm:pt-6"
        style={{ borderColor: 'color-mix(in oklab, var(--org-brand-accent, #d4af37) 55%, transparent)' }}
      >
        <span
          className="inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.13em]"
          style={{
            background: 'color-mix(in oklab, var(--org-brand-accent, #d4af37) 88%, white 12%)',
            color: 'var(--org-brand-primary, #121212)',
          }}
        >
          We&apos;re hiring
        </span>
      </div>
      <div className="flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-7 sm:py-6">
        <div className="min-w-0">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: 'color-mix(in oklab, var(--jobs-on-primary, #faf9f6) 72%, transparent)' }}
          >
            {orgName}
          </p>
          <p
            className="mt-1 font-authSerif text-[clamp(1.75rem,4vw,2.25rem)] leading-[1.15] tracking-[-0.02em]"
            style={{ color: 'var(--jobs-on-primary, #faf9f6)' }}
          >
            {orgName}
          </p>
          {description ? (
            <div
              className="mt-2 max-w-xl text-[13px] leading-relaxed"
              style={{ color: 'color-mix(in oklab, var(--jobs-on-primary, #faf9f6) 75%, transparent)' }}
            >
              {description}
            </div>
          ) : null}
        </div>
        {trailing ? <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">{trailing}</div> : null}
      </div>
    </section>
  );
}

/** Compact org block — auth flows, job detail, apply, token pages. Parent should use gap or space-y for spacing above. */
export function CareersOrgLine({ orgName, className = '' }: { orgName: string; className?: string }) {
  return (
    <div
      className={`rounded-2xl border px-5 py-4 sm:px-6 sm:py-5 ${className}`}
      style={{
        borderColor: 'color-mix(in oklab, var(--org-brand-primary, #121212) 32%, transparent)',
        background: 'color-mix(in oklab, var(--org-brand-primary, #121212) 92%, white 8%)',
      }}
    >
      <p
        className="text-[11px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: 'color-mix(in oklab, var(--jobs-on-primary, #faf9f6) 72%, transparent)' }}
      >
        Organisation
      </p>
      <p
        className="mt-1 font-authSerif text-[clamp(1.25rem,3vw,1.75rem)] leading-tight tracking-[-0.02em]"
        style={{ color: 'var(--jobs-on-primary, #faf9f6)' }}
      >
        {orgName}
      </p>
    </div>
  );
}
