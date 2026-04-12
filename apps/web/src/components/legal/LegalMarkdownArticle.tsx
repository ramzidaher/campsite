'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Matches broadcast detail typography for legal policy bodies. */
const articleClass =
  'max-w-none text-[15px] leading-[1.65] text-[#121212] [&_a]:font-medium [&_a]:text-emerald-700 [&_a]:underline [&_a]:decoration-emerald-700/30 [&_a]:underline-offset-2 [&_blockquote]:border-l-2 [&_blockquote]:border-[#d8d8d8] [&_blockquote]:pl-4 [&_blockquote]:text-[#6b6b6b] [&_code]:rounded [&_code]:bg-[#f5f4f1] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[13px] [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-5 [&_h3]:text-base [&_h3]:font-semibold [&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-3 [&_p:first-child]:mt-0 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-[#d8d8d8] [&_pre]:bg-[#f5f4f1] [&_pre]:p-3 [&_pre]:text-[13px] [&_strong]:font-semibold [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5';

export function LegalMarkdownArticle({ markdown, className }: { markdown: string; className?: string }) {
  const body = markdown.trim();
  return (
    <article className={[articleClass, className].filter(Boolean).join(' ')}>
      {body ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown> : (
        <p className="text-[#9b9b9b]">No content yet.</p>
      )}
    </article>
  );
}
