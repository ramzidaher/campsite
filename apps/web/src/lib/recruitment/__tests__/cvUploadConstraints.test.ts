import { cvUploadValidationMessage, isAllowedCvMime } from '@/lib/recruitment/cvUploadConstraints';

describe('cvUploadConstraints', () => {
  it('allows pdf by extension when mime empty', () => {
    expect(isAllowedCvMime('', 'resume.PDF')).toBe(true);
  });

  it('rejects oversize files', () => {
    const msg = cvUploadValidationMessage('x.pdf', 6 * 1024 * 1024, 'application/pdf');
    expect(msg).toMatch(/smaller/);
  });

  it('accepts valid pdf', () => {
    expect(cvUploadValidationMessage('x.pdf', 1000, 'application/pdf')).toBeNull();
  });
});
