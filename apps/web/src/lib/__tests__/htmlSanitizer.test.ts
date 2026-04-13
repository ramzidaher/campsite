import { sanitizeOfferHtml } from '@/lib/security/htmlSanitizer';

describe('sanitizeOfferHtml', () => {
  it('removes script tags and event handlers', () => {
    const input = `<p onclick="alert(1)">ok</p><script>alert(1)</script>`;
    const output = sanitizeOfferHtml(input);
    expect(output).toContain('<p>ok</p>');
    expect(output).not.toContain('script');
    expect(output).not.toContain('onclick');
  });

  it('removes javascript URLs', () => {
    const input = `<a href="javascript:alert(1)">click</a>`;
    const output = sanitizeOfferHtml(input);
    expect(output).toContain('<a rel="noopener noreferrer nofollow">click</a>');
    expect(output).not.toContain('javascript:');
  });

  it('drops dangerous nested tags and keeps safe content', () => {
    const input = `<div><math><mtext>x</mtext></math><p>safe</p><svg><script>alert(1)</script></svg></div>`;
    const output = sanitizeOfferHtml(input);
    expect(output).toContain('<p>safe</p>');
    expect(output).not.toContain('<math');
    expect(output).not.toContain('<svg');
    expect(output).not.toContain('<script');
  });

  it('removes encoded inline handler payloads', () => {
    const input = `<img src=x onerror=&#x61;lert(1) /><p>ok</p>`;
    const output = sanitizeOfferHtml(input);
    expect(output).toContain('<p>ok</p>');
    expect(output).not.toContain('onerror');
    expect(output).not.toContain('alert');
  });

  it('blocks malformed javascript href payloads', () => {
    const input = `<a href=" JaVaScRiPt:alert(1) ">open</a>`;
    const output = sanitizeOfferHtml(input);
    expect(output).toBe('<a rel="noopener noreferrer nofollow">open</a>');
  });

  it('preserves safe formatting tags', () => {
    const input = `<h2>Offer</h2><p><strong>Welcome</strong> to the team.</p><ul><li>Item</li></ul>`;
    const output = sanitizeOfferHtml(input);
    expect(output).toContain('<h2>Offer</h2>');
    expect(output).toContain('<strong>Welcome</strong>');
    expect(output).toContain('<ul><li>Item</li></ul>');
  });
});
