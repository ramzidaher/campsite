'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, Info, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { matchPageInfo } from '@/lib/pageInfoRegistry';

export function PageInfoFab() {
  const pathname = usePathname() ?? '';
  const info = useMemo(() => matchPageInfo(pathname), [pathname]);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (!info) return null;

  const panelId = `page-info-${info.id}`;

  return (
    <div
      ref={containerRef}
      className="pointer-events-none fixed bottom-5 right-4 z-[80] flex w-[min(22rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] flex-col items-end gap-3 sm:bottom-6 sm:right-6"
    >
      {isOpen ? (
        <section
          id={panelId}
          aria-label={`${info.title} page information`}
          className="pointer-events-auto w-full rounded-[22px] p-4 shadow-[0_18px_55px_rgba(18,18,18,0.18)] backdrop-blur"
          style={{
            border: '1px solid color-mix(in oklab, var(--org-brand-primary) 18%, var(--org-brand-border))',
            background: 'color-mix(in oklab, var(--org-brand-surface) 88%, white)',
            color: 'var(--org-brand-text)',
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
              style={{
                background: 'color-mix(in oklab, var(--org-brand-primary) 14%, var(--org-brand-bg))',
                color: 'var(--org-brand-primary)',
              }}
            >
              <Info className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--org-brand-primary)' }}>
                About this page
              </p>
              <h2 className="mt-1 font-authSerif text-[21px] leading-tight tracking-[-0.03em]" style={{ color: 'var(--org-brand-text)' }}>
                {info.title}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors"
              aria-label="Close page info"
              style={{ color: 'var(--org-brand-muted)' }}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <p className="mt-3 text-[13px] leading-6" style={{ color: 'var(--org-brand-muted)' }}>
            {info.summary}
          </p>

          {info.highlights?.length ? (
            <ul className="mt-3 space-y-2.5 text-[12.5px] leading-5" style={{ color: 'var(--org-brand-muted)' }}>
              {info.highlights.map((highlight) => (
                <li key={highlight} className="flex items-start gap-2.5">
                  <span
                    className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
                    aria-hidden
                    style={{ background: 'var(--org-brand-primary)' }}
                  />
                  <span>{highlight}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {info.links?.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {info.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-[12.5px] font-medium transition-colors"
                  style={{
                    border: '1px solid color-mix(in oklab, var(--org-brand-primary) 22%, var(--org-brand-border))',
                    background: 'color-mix(in oklab, var(--org-brand-primary) 8%, var(--org-brand-bg))',
                    color: 'var(--org-brand-primary)',
                  }}
                >
                  <span>{link.label}</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-label={isOpen ? 'Hide page information' : 'Show page information'}
        className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full shadow-[0_10px_24px_rgba(18,18,18,0.14)] transition-transform hover:-translate-y-0.5 sm:h-11 sm:w-11"
        style={{
          border: '1px solid color-mix(in oklab, var(--org-brand-primary) 28%, var(--org-brand-border))',
          background: 'color-mix(in oklab, var(--org-brand-primary) 10%, var(--org-brand-bg))',
          color: 'var(--org-brand-primary)',
        }}
      >
        {isOpen ? <X className="h-4 w-4 sm:h-[18px] sm:w-[18px]" aria-hidden /> : <Info className="h-4 w-4 sm:h-[18px] sm:w-[18px]" aria-hidden />}
      </button>
    </div>
  );
}
