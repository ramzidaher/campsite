import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** Matches `/forbidden` primary CTA — outline pill on cream workspace. */
export const simpleStatusOutlineButtonClass =
  'inline-flex h-10 items-center justify-center rounded-lg border border-[#d8d8d8] bg-white px-4 text-[13px] font-medium text-[#121212] transition-colors hover:bg-[#f5f4f1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#121212]/15 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--campsite-bg)]';

type MinHeight = '60vh' | 'screen' | 'none';

type SimpleStatusPageProps = {
  badge?: string;
  title: string;
  titleId?: string;
  description?: ReactNode;
  descriptionId?: string;
  /** Extra blocks: banners, forms, action rows */
  children?: ReactNode;
  footer?: ReactNode;
  minHeight?: MinHeight;
  className?: string;
};

export function SimpleStatusPage({
  badge,
  title,
  titleId,
  description,
  descriptionId,
  children,
  footer,
  minHeight = '60vh',
  className,
}: SimpleStatusPageProps) {
  const mh =
    minHeight === 'screen' ? 'min-h-screen' : minHeight === 'none' ? '' : 'min-h-[60vh]';

  return (
    <div
      className={cn(
        'mx-auto flex w-full max-w-md flex-col items-start justify-center px-5 py-12 sm:px-[28px]',
        mh,
        className,
      )}
    >
      {badge ? (
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#6b6b6b]">{badge}</p>
      ) : null}
      <h1
        id={titleId}
        className="mt-2 font-authSerif text-[28px] tracking-tight text-[#121212]"
      >
        {title}
      </h1>
      {description != null && description !== '' ? (
        <div
          id={descriptionId}
          className="mt-2 text-[13px] leading-relaxed text-[#6b6b6b]"
        >
          {description}
        </div>
      ) : null}
      {children}
      {footer ? <div className="mt-6 text-[13px] text-[#6b6b6b]">{footer}</div> : null}
    </div>
  );
}
