'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

export type SendButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children?: React.ReactNode;
};

/**
 * Primary “send” control with paper-plane hover motion.
 * Uses org branding tokens (same as the rest of the tenant shell) — no styled-components.
 */
export function SendButton({ className, children = 'Send now', type = 'button', ...props }: SendButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'group relative inline-flex cursor-pointer items-center overflow-hidden rounded-2xl border border-transparent',
        'bg-[var(--org-brand-primary,#121212)] pl-[0.9em] pr-5 py-2 text-sm font-medium text-[var(--org-brand-on-primary,#faf9f6)]',
        'transition-transform duration-200 active:scale-[0.98]',
        'hover:opacity-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--org-brand-primary,#121212)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F9F8F6]',
        'disabled:pointer-events-none disabled:opacity-45',
        'motion-reduce:transition-none motion-reduce:active:scale-100',
        className
      )}
      {...props}
    >
      <span className="inline-flex items-center">
        <span className="inline-flex items-center motion-safe:group-hover:animate-send-btn-icon-bob">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width={20}
            height={20}
            className="origin-[35%_50%] transition-transform duration-300 ease-out motion-safe:group-hover:translate-x-[1.2em] motion-safe:group-hover:rotate-45 motion-safe:group-hover:scale-110 motion-reduce:group-hover:translate-x-0 motion-reduce:group-hover:rotate-0 motion-reduce:group-hover:scale-100"
            aria-hidden
          >
            <path fill="none" d="M0 0h24v24H0z" />
            <path
              fill="currentColor"
              d="M1.946 9.315c-.522-.174-.527-.455.01-.634l19.087-6.362c.529-.176.832.12.684.638l-5.454 19.086c-.15.529-.455.547-.679.045L12 14l6-8-8 6-8.054-2.685z"
            />
          </svg>
        </span>
      </span>
      <span className="ml-1 inline-block transition-transform duration-300 ease-out motion-safe:group-hover:translate-x-[5rem] motion-reduce:group-hover:translate-x-0">
        {children}
      </span>
    </button>
  );
}
