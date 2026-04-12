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
    <div className="mx-auto max-w-2xl px-5 py-16 text-[#121212] sm:px-[28px]">
      <h1 className="font-authSerif text-[26px] leading-tight tracking-tight">{title}</h1>
      <p className="mt-2 text-[12px] text-[#9b9b9b]">
        Last updated: {effectiveLabel} · Bundle {bundleVersion}
      </p>
      <div className="mt-8 border-t border-[#ebe9e6] pt-8">
        <LegalMarkdownArticle markdown={markdown} />
      </div>
      <p className="mt-10 text-[13px]">
        <Link href="/" className="text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]">
          ← Home
        </Link>
      </p>
    </div>
  );
}
