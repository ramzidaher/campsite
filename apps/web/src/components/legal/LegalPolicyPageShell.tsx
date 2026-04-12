import Link from 'next/link';
import { LegalMarkdownArticle } from '@/components/legal/LegalMarkdownArticle';

export function LegalPolicyPageShell({
  title,
  bundleVersion,
  effectiveLabel,
  markdown,
}: {
  title: string;
  bundleVersion: string;
  effectiveLabel: string;
  markdown: string;
}) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-16 text-[var(--campsite-text)] sm:px-[28px]">
      <h1 className="font-authSerif text-[26px] leading-tight tracking-tight text-[var(--campsite-text)]">
        {title}
      </h1>
      <p className="mt-2 text-[12px] text-[var(--campsite-text-muted)]">
        Last updated: {effectiveLabel} · Bundle {bundleVersion}
      </p>
      <div className="mt-8 border-t border-[var(--campsite-border)] pt-8">
        <LegalMarkdownArticle markdown={markdown} />
      </div>
      <p className="mt-10 text-[13px]">
        <Link
          href="/"
          className="text-[var(--campsite-text-secondary)] underline underline-offset-2 hover:text-[var(--campsite-text)]"
        >
          ← Home
        </Link>
      </p>
    </div>
  );
}
