import React from 'react';

import { campusText } from './campusTokens';

export type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  /** Right-aligned actions (buttons, links). */
  actions?: React.ReactNode;
  className?: string;
};

export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return (
    <header className={['mb-8 flex flex-col gap-4 border-b border-[#e8e8e8] pb-6 sm:flex-row sm:items-start sm:justify-between', className].filter(Boolean).join(' ')}>
      <div className="min-w-0">
        {eyebrow ? (
          <p className={`text-[12px] font-semibold uppercase tracking-widest ${campusText.subtle}`}>{eyebrow}</p>
        ) : null}
        <h1 className={`mt-1 font-authSerif text-[28px] leading-tight tracking-[-0.03em] ${campusText.ink}`}>{title}</h1>
        {description ? <p className={`mt-1 max-w-2xl text-[13.5px] leading-relaxed ${campusText.muted}`}>{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
