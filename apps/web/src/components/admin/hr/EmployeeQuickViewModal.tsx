'use client';

import Link from 'next/link';
import { useEffect, useId, type ReactNode } from 'react';

export function EmployeeQuickViewModal({
  open,
  onClose,
  backLabel,
  title,
  subtitle,
  children,
  fullRecordHref,
}: {
  open: boolean;
  onClose: () => void;
  /** Label after the back chevron, e.g. "Employee records" or "Members" */
  backLabel: string;
  title: string;
  subtitle?: string | null;
  children: ReactNode;
  /** When set, shows footer CTA and header arrow to full file */
  fullRecordHref?: string;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center p-4 sm:items-center"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-[3px] motion-safe:animate-employee-modal-backdrop motion-reduce:animate-none motion-reduce:opacity-100"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        className="relative z-10 flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[#d8d8d8] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08),0_16px_40px_rgba(0,0,0,0.08)] motion-safe:animate-employee-modal-panel motion-reduce:animate-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex shrink-0 items-start gap-2 border-b border-[#d8d8d8] px-4 py-4 sm:px-6 sm:py-5">
          <button
            type="button"
            className="shrink-0 rounded-md px-1 py-0.5 text-[13px] font-medium text-[#6b6b6b] hover:bg-[#f5f4f1] hover:text-[#121212]"
            onClick={onClose}
          >
            <span aria-hidden className="mr-0.5">
              ‹
            </span>
            Back to {backLabel}
          </button>
          <div className="min-w-0 flex-1 text-center">
            <h2 id={titleId} className="font-authSerif text-lg leading-tight text-[#121212] sm:text-xl">
              {title}
            </h2>
            {subtitle ? <p className="mt-0.5 truncate text-[12.5px] text-[#9b9b9b]">{subtitle}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {fullRecordHref ? (
              <Link
                href={fullRecordHref}
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#d8d8d8] text-[15px] text-[#121212] hover:bg-[#f5f4f1]"
                aria-label="Open full employee record"
                title="Open full employee record"
              >
                →
              </Link>
            ) : null}
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#d8d8d8] text-[#6b6b6b] hover:bg-[#f5f4f1]"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">{children}</div>

        {fullRecordHref ? (
          <div className="shrink-0 border-t border-[#d8d8d8] bg-white px-4 py-4 sm:px-6">
            <Link
              href={fullRecordHref}
              onClick={onClose}
              className="inline-flex w-full items-center justify-center rounded-xl bg-[#121212] px-4 py-3 text-[13px] font-semibold text-[#faf9f6] hover:opacity-95 sm:w-auto"
            >
              View full employee record
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
