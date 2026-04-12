'use client';

import type { Components } from 'react-markdown';
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { slugifyHeading } from '@/lib/legal/markdownHeadings';

function mdPlainText(children: ReactNode): string {
  if (children == null || typeof children === 'boolean') return '';
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(mdPlainText).join('');
  if (typeof children === 'object' && children && 'props' in children) {
    const p = (children as React.ReactElement<{ children?: ReactNode }>).props;
    return mdPlainText(p.children);
  }
  return '';
}

/** Body typography without heading selectors (used when `withHeadingAnchors` supplies h2/h3). */
const articleBodyClass =
  'max-w-none text-[15px] leading-[1.65] text-[var(--campsite-text)] [&_a]:font-medium [&_a]:text-[var(--campsite-success)] [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--campsite-border)] [&_blockquote]:pl-4 [&_blockquote]:text-[var(--campsite-text-secondary)] [&_code]:rounded [&_code]:bg-[var(--campsite-surface)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[13px] [&_code]:text-[var(--campsite-text)] [&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-3 [&_p:first-child]:mt-0 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-[var(--campsite-border)] [&_pre]:bg-[var(--campsite-surface)] [&_pre]:p-3 [&_pre]:text-[13px] [&_pre]:text-[var(--campsite-text)] [&_strong]:font-semibold [&_strong]:text-[var(--campsite-text)] [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5';

/** Default: includes heading styles via Tailwind arbitrary variants (public pages). */
const articleClassFull =
  `${articleBodyClass} [&_h2]:mt-6 [&_h2]:scroll-mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-[var(--campsite-text)] [&_h3]:mt-5 [&_h3]:scroll-mt-4 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-[var(--campsite-text)]`;

function headingComponents(): Pick<Components, 'h2' | 'h3'> {
  return {
    h2: ({ children }) => {
      const id = slugifyHeading(mdPlainText(children));
      return (
        <h2
          id={id}
          className="mt-6 scroll-mt-4 text-lg font-semibold text-[var(--campsite-text)] first:mt-0 [&:first-child]:mt-0"
        >
          {children}
        </h2>
      );
    },
    h3: ({ children }) => {
      const id = slugifyHeading(mdPlainText(children));
      return (
        <h3 id={id} className="mt-5 scroll-mt-4 text-base font-semibold text-[var(--campsite-text)]">
          {children}
        </h3>
      );
    },
  };
}

export function LegalMarkdownArticle({
  markdown,
  className,
  withHeadingAnchors = false,
}: {
  markdown: string;
  className?: string;
  /** When true, render `##` / `###` with stable `id`s for TOC scroll targets (Founder HQ preview). */
  withHeadingAnchors?: boolean;
}) {
  const body = markdown.trim();
  const articleClass = withHeadingAnchors ? articleBodyClass : articleClassFull;
  const components = withHeadingAnchors ? headingComponents() : undefined;

  return (
    <article className={[articleClass, className].filter(Boolean).join(' ')}>
      {body ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {markdown}
        </ReactMarkdown>
      ) : (
        <p className="text-[var(--campsite-text-muted)]">No content yet.</p>
      )}
    </article>
  );
}
