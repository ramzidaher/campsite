import type { ReactNode } from 'react';

/** Campsite + Careers + Common Ground Studios — use at the top of every public careers route. */
export function CareersProductStrip({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded-2xl border px-5 py-4 shadow-[0_1px_0_0_rgba(18,18,18,0.04)] sm:px-6 ${className}`}
      style={{
        borderColor: 'var(--org-brand-border, #e8e6e3)',
        background: `linear-gradient(135deg, color-mix(in oklab, var(--org-brand-surface, #f5f4f1) 55%, #ffffff 45%), var(--org-brand-surface, #f5f4f1))`,
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-authSerif text-[1.35rem] leading-none tracking-tight sm:text-[1.5rem]" style={{ color: 'var(--org-brand-text, #121212)' }}>
            Campsite
          </span>
          <span className="hidden h-5 w-px sm:block" aria-hidden style={{ background: 'var(--org-brand-border, #d8d8d8)' }} />
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em]"
            style={{
              background: 'var(--org-brand-primary, #121212)',
              color: 'var(--jobs-on-primary, #faf9f6)',
            }}
          >
            Careers
          </span>
        </div>
        <p className="text-[12px] leading-snug sm:text-right" style={{ color: 'var(--org-brand-muted, #6b6b6b)' }}>
          Hiring tools by <span className="font-semibold" style={{ color: 'var(--org-brand-text, #121212)' }}>Common Ground Studios Ltd</span>
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
      className={`mt-5 rounded-2xl border px-5 py-5 sm:px-7 sm:py-6 ${className}`}
      style={{
        borderColor: 'var(--org-brand-border, #e8e6e3)',
        background: 'var(--org-brand-surface, #f5f4f1)',
      }}
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--org-brand-muted, #9b9b9b)' }}>Your organisation</p>
          <p className="mt-1 font-authSerif text-[clamp(1.75rem,4vw,2.25rem)] leading-[1.15] tracking-[-0.02em]" style={{ color: 'var(--org-brand-text, #121212)' }}>
            {orgName}
          </p>
          {description ? (
            <div className="mt-2 max-w-xl text-[13px] leading-relaxed" style={{ color: 'var(--org-brand-muted, #6b6b6b)' }}>{description}</div>
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
        borderColor: 'var(--org-brand-border, #e8e6e3)',
        background: 'var(--org-brand-surface, #f5f4f1)',
      }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--org-brand-muted, #9b9b9b)' }}>Your organisation</p>
      <p className="mt-1 font-authSerif text-[clamp(1.25rem,3vw,1.75rem)] leading-tight tracking-[-0.02em]" style={{ color: 'var(--org-brand-text, #121212)' }}>
        {orgName}
      </p>
    </div>
  );
}
