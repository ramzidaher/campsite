'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Matches broadcast detail rhythm; colours follow `globals.css` :root tokens (light + dark). */
const articleClass =
  'max-w-none text-[15px] leading-[1.65] text-[var(--campsite-text)] [&_a]:font-medium [&_a]:text-[var(--campsite-success)] [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--campsite-border)] [&_blockquote]:pl-4 [&_blockquote]:text-[var(--campsite-text-secondary)] [&_code]:rounded [&_code]:bg-[var(--campsite-surface)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[13px] [&_code]:text-[var(--campsite-text)] [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-[var(--campsite-text)] [&_h3]:mt-5 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-[var(--campsite-text)] [&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-3 [&_p:first-child]:mt-0 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-[var(--campsite-border)] [&_pre]:bg-[var(--campsite-surface)] [&_pre]:p-3 [&_pre]:text-[13px] [&_pre]:text-[var(--campsite-text)] [&_strong]:font-semibold [&_strong]:text-[var(--campsite-text)] [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5';

export function LegalMarkdownArticle({ markdown, className }: { markdown: string; className?: string }) {
  const body = markdown.trim();
  return (
    <article className={[articleClass, className].filter(Boolean).join(' ')}>
      {body ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown> : (
        <p className="text-[var(--campsite-text-muted)]">No content yet.</p>
      )}
    </article>
  );
}
