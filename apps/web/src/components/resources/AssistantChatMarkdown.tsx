'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

/**
 * Renders Scout (document assistant) replies that may use Markdown (lists, **bold**, `code`, tables, etc.).
 * HTML in source is not executed (react-markdown default).
 */
const components: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0 first:mt-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-1 pl-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-1 pl-0">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ href, children }) => (
    <a
      href={href}
      className="font-medium text-[var(--org-brand-primary)] underline underline-offset-2"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  h1: ({ children }) => <h3 className="mb-2 mt-3 text-base font-semibold first:mt-0">{children}</h3>,
  h2: ({ children }) => <h4 className="mb-2 mt-3 text-[15px] font-semibold first:mt-0">{children}</h4>,
  h3: ({ children }) => <h4 className="mb-1 mt-2 text-[14px] font-semibold first:mt-0">{children}</h4>,
  hr: () => <hr className="my-3 border-[color-mix(in_oklab,var(--org-brand-border)_85%,transparent)]" />,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-[color-mix(in_oklab,var(--org-brand-primary)_35%,var(--org-brand-border))] pl-3 text-[var(--org-brand-muted)]">
      {children}
    </blockquote>
  ),
  pre: ({ children }) => (
    <pre className="mb-2 overflow-x-auto rounded-lg bg-[color-mix(in_oklab,var(--org-brand-surface)_80%,var(--org-brand-border))] p-3 text-[12px] last:mb-0">
      {children}
    </pre>
  ),
  code: ({ className, children, ...props }) => {
    const isFence = Boolean(className && /language-/.test(className));
    if (isFence) {
      return (
        <code className={`font-mono text-[12px] ${className ?? ''}`} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded bg-[color-mix(in_oklab,var(--org-brand-surface)_70%,var(--org-brand-border))] px-1.5 py-0.5 font-mono text-[12px]"
        {...props}
      >
        {children}
      </code>
    );
  },
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full min-w-[200px] border-collapse border border-[color-mix(in_oklab,var(--org-brand-border)_88%,transparent)] text-left text-[12px]">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-[color-mix(in_oklab,var(--org-brand-surface)_90%,var(--org-brand-bg))]">{children}</thead>
  ),
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr className="border-b border-[color-mix(in_oklab,var(--org-brand-border)_88%,transparent)]">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="border border-[color-mix(in_oklab,var(--org-brand-border)_88%,transparent)] px-2 py-1.5 font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-[color-mix(in_oklab,var(--org-brand-border)_88%,transparent)] px-2 py-1.5 align-top">
      {children}
    </td>
  ),
};

export function AssistantChatMarkdown({
  content,
  variant = 'default',
}: {
  content: string;
  /** `muted` matches footer note typography. */
  variant?: 'default' | 'muted';
}) {
  const tone =
    variant === 'muted'
      ? 'text-[11px] leading-[1.45] text-[var(--org-brand-muted)]'
      : 'text-[13.5px] leading-[1.55] text-[var(--org-brand-text)]';
  return (
    <div className={`resource-assistant-markdown ${tone}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
