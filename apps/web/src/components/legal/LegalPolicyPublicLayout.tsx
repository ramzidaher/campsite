'use client';

import { Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { LegalMarkdownArticle } from '@/components/legal/LegalMarkdownArticle';
import { PUBLIC_LEGAL_DOCS, type LegalPublicDocId } from '@/lib/legal/publicLegalDocs';
import type { MarkdownHeading } from '@/lib/legal/markdownHeadings';

export function LegalPolicyPublicLayout({
  activeDoc,
  title,
  bundleVersion,
  effectiveLabel,
  markdown,
  headingsByDoc,
}: {
  activeDoc: LegalPublicDocId;
  title: string;
  bundleVersion: string;
  effectiveLabel: string;
  markdown: string;
  headingsByDoc: Record<LegalPublicDocId, MarkdownHeading[]>;
}) {
  const pathname = usePathname();
  const [tocQuery, setTocQuery] = useState('');

  const q = tocQuery.trim().toLowerCase();

  const visibleDocs = useMemo(() => {
    if (!q) return [...PUBLIC_LEGAL_DOCS];
    return PUBLIC_LEGAL_DOCS.filter(({ id, label }) => {
      if (id === activeDoc) return true;
      if (label.toLowerCase().includes(q)) return true;
      return headingsByDoc[id].some((h) => h.text.toLowerCase().includes(q));
    });
  }, [q, headingsByDoc, activeDoc]);

  const filterHeading = (h: MarkdownHeading) => {
    if (!q) return true;
    return h.text.toLowerCase().includes(q);
  };

  const activeHeadings = headingsByDoc[activeDoc].filter(filterHeading);

  // Deep-link: /terms#section-id
  useEffect(() => {
    const run = () => {
      const hash = typeof window !== 'undefined' ? window.location.hash.slice(1) : '';
      if (!hash) return;
      window.setTimeout(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    };
    run();
  }, [pathname, markdown]);

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 text-[var(--campsite-text)] sm:px-6 lg:px-8 lg:py-16">
      <div className="flex flex-col gap-10 lg:flex-row lg:gap-12 lg:items-start">
        <aside
          className="flex w-full shrink-0 flex-col rounded-xl border border-[var(--campsite-border)] bg-[var(--campsite-surface)] p-4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3.5rem)] lg:w-[280px]"
          aria-label="Legal policies navigation"
        >
          <div className="shrink-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--campsite-text-muted)]">
              Table of contents
            </div>
            <div className="mt-3 flex h-9 items-center gap-2 rounded-lg border border-[var(--campsite-border)] bg-[var(--campsite-bg)] px-3 transition-colors focus-within:border-[var(--campsite-text-muted)]">
              <Search className="size-3.5 shrink-0 text-[var(--campsite-text-muted)]" aria-hidden />
              <input
                type="search"
                placeholder="Search"
                value={tocQuery}
                onChange={(e) => setTocQuery(e.target.value)}
                aria-label="Filter policies and sections"
                className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[var(--campsite-text)] outline-none placeholder:text-[var(--campsite-text-muted)]"
              />
            </div>
          </div>

          <nav
            className="mt-4 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-y-contain pr-1 [-webkit-overflow-scrolling:touch] [scrollbar-gutter:stable] max-h-[min(52vh,26rem)] lg:max-h-none [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--campsite-border)]"
          >
            {visibleDocs.length === 0 ? (
              <p className="py-2 text-[13px] text-[var(--campsite-text-secondary)]">No sections match.</p>
            ) : (
              visibleDocs.map(({ id, href, label }) => {
                const isActive = id === activeDoc;
                const docHeadings = id === activeDoc ? activeHeadings : headingsByDoc[id].filter(filterHeading);
                return (
                  <div key={id}>
                    <Link
                      href={href}
                      className={[
                        'block rounded-lg px-3 py-2 text-[13px] font-medium leading-snug transition-colors',
                        isActive
                          ? 'bg-[var(--campsite-bg)] text-[var(--campsite-text)] shadow-sm ring-1 ring-[var(--campsite-border)]'
                          : 'text-[var(--campsite-text-secondary)] hover:bg-[var(--campsite-bg)]/80 hover:text-[var(--campsite-text)]',
                      ].join(' ')}
                    >
                      {label}
                    </Link>
                    {isActive && docHeadings.length > 0 ? (
                      <ul className="mt-1 space-y-0.5 border-l border-[var(--campsite-border)] pl-3 ml-2">
                        {docHeadings.map((h) => (
                          <li key={`${id}-${h.id}`}>
                            <a
                              href={`#${h.id}`}
                              className={[
                                'block rounded py-1.5 pl-2 text-[12px] leading-snug text-[var(--campsite-text-secondary)] transition-colors hover:text-[var(--campsite-text)]',
                                h.level === 3 ? 'pl-4' : '',
                              ].join(' ')}
                            >
                              {h.text}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })
            )}
          </nav>

          <div className="mt-6 shrink-0 border-t border-[var(--campsite-border)] pt-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--campsite-text-muted)]">
              Bundle
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-[var(--campsite-text-secondary)]">
              <span className="text-[var(--campsite-text-muted)]">Version</span> {bundleVersion}
              <br />
              <span className="text-[var(--campsite-text-muted)]">Effective</span> {effectiveLabel}
            </p>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <h1 className="font-authSerif text-[26px] leading-tight tracking-tight text-[var(--campsite-text)]">
            {title}
          </h1>
          <p className="mt-2 text-[12px] text-[var(--campsite-text-muted)]">
            Last updated: {effectiveLabel} · Bundle {bundleVersion}
          </p>
          <div className="mt-8 border-t border-[var(--campsite-border)] pt-8">
            <LegalMarkdownArticle markdown={markdown} withHeadingAnchors />
          </div>
          <p className="mt-10 text-[13px]">
            <Link
              href="/"
              className="text-[var(--campsite-text-secondary)] underline underline-offset-2 hover:text-[var(--campsite-text)]"
            >
              ← Home
            </Link>
          </p>
        </main>
      </div>
    </div>
  );
}
