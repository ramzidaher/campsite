import { extractMarkdownHeadings, type MarkdownHeading } from '@/lib/legal/markdownHeadings';
import type { PlatformLegalSettings } from '@/lib/legal/types';

/** Public routes for platform legal policies (shared by founder HQ + public pages). */
export const PUBLIC_LEGAL_DOCS = [
  { id: 'terms' as const, href: '/terms', label: 'Terms of service' },
  { id: 'privacy' as const, href: '/privacy', label: 'Privacy policy' },
  { id: 'data_processing' as const, href: '/legal/data-processing', label: 'Data processing' },
] as const;

export type LegalPublicDocId = (typeof PUBLIC_LEGAL_DOCS)[number]['id'];

export function headingsByDocFromPlatformSettings(
  s: PlatformLegalSettings
): Record<LegalPublicDocId, MarkdownHeading[]> {
  return {
    terms: extractMarkdownHeadings(s.terms_markdown),
    privacy: extractMarkdownHeadings(s.privacy_markdown),
    data_processing: extractMarkdownHeadings(s.data_processing_markdown),
  };
}
