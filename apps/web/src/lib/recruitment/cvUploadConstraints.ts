/** Server and client must stay aligned for CV uploads. */
export const CV_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const CV_MIME_ALLOW = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export function isAllowedCvMime(type: string, filename: string): boolean {
  const t = type.trim().toLowerCase();
  if (t && CV_MIME_ALLOW.has(t)) return true;
  const lower = filename.toLowerCase();
  return lower.endsWith('.pdf') || lower.endsWith('.doc') || lower.endsWith('.docx');
}

export function cvUploadValidationMessage(filename: string, sizeBytes: number, mimeType: string): string | null {
  if (sizeBytes > CV_MAX_BYTES) {
    return `CV must be ${Math.floor(CV_MAX_BYTES / (1024 * 1024))} MB or smaller.`;
  }
  if (!isAllowedCvMime(mimeType, filename)) {
    return 'CV must be a PDF or Word document (.pdf, .doc, .docx).';
  }
  return null;
}
