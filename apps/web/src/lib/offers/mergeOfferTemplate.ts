import { sanitizeOfferHtml } from '@/lib/security/htmlSanitizer';

/** Merge field keys supported in offer HTML templates. */
export const OFFER_MERGE_FIELD_KEYS = [
  'candidate_name',
  'job_title',
  'salary',
  'start_date',
  'contract_type',
] as const;

export type OfferMergeFieldKey = (typeof OFFER_MERGE_FIELD_KEYS)[number];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function mergeOfferTemplateHtml(
  html: string,
  vars: Partial<Record<OfferMergeFieldKey, string>>
): string {
  let out = html;
  for (const key of OFFER_MERGE_FIELD_KEYS) {
    const raw = vars[key] ?? '';
    out = out.split(`{{${key}}}`).join(escapeHtml(raw));
  }
  return out;
}

export function htmlToPlainTextForPdf(html: string): string {
  const sanitized = sanitizeOfferHtml(html);
  return sanitized
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
