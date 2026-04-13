import fs from 'fs';
import path from 'path';

import { htmlToPlainTextForPdf, mergeOfferTemplateHtml } from '@/lib/offers/mergeOfferTemplate';

const repoRoot = path.resolve(__dirname, '../../../../..');

function readMergeTemplateSource(): string {
  return fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/lib/offers/mergeOfferTemplate.ts'),
    'utf8'
  );
}

describe('offer pipeline sanitization regression guards', () => {
  it('does not rely on regex-based script stripping in mergeOfferTemplate', () => {
    const src = readMergeTemplateSource();
    expect(src).toContain("import { sanitizeOfferHtml } from '@/lib/security/htmlSanitizer'");
    expect(src).toContain('const sanitized = sanitizeOfferHtml(html);');
    expect(src).not.toContain('replace(/<script');
    expect(src).not.toContain('replace(/.*on[a-z]+=');
  });

  it('neutralizes malicious script/event payloads via centralized sanitizer path', () => {
    const merged = mergeOfferTemplateHtml(
      '<h2>Offer</h2><p>Hello {{candidate_name}}</p><img src=x onerror=alert(1) /><script>alert(1)</script><a href="javascript:alert(2)">open</a>',
      { candidate_name: 'Alex <script>alert(9)</script>' }
    );
    const plain = htmlToPlainTextForPdf(merged);
    expect(plain).toContain('Offer');
    expect(plain).toContain('Hello Alex <script>alert(9)</script>');
    expect(plain).not.toContain('javascript:');
    expect(plain).not.toContain('onerror');
    expect(plain).not.toContain('<script>alert(1)</script>');
  });

  it('preserves safe formatting semantics for PDF plain text output', () => {
    const merged = mergeOfferTemplateHtml(
      '<h2>Offer Letter</h2><p>Welcome {{candidate_name}}</p><p>Start: {{start_date}}</p><ul><li>Benefit A</li><li>Benefit B</li></ul>',
      { candidate_name: 'Casey', start_date: '2026-09-01' }
    );
    const plain = htmlToPlainTextForPdf(merged);
    expect(plain).toContain('Offer Letter');
    expect(plain).toContain('Welcome Casey');
    expect(plain).toContain('Start: 2026-09-01');
    expect(plain).toContain('Benefit A');
    expect(plain).toContain('Benefit B');
  });
});
