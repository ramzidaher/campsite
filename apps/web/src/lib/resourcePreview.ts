export type ResourcePreviewKind = 'pdf' | 'image' | 'text' | 'video' | 'audio' | null;

/** Max bytes to pull into the page for plain-text preview (avoids huge in-memory strings). */
export const TEXT_PREVIEW_MAX_BYTES = 512_000;

export function getResourcePreviewKind(mimeType: string, fileName: string): ResourcePreviewKind {
  const m = (mimeType || '').toLowerCase();
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (m === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (
    m.startsWith('text/') ||
    m === 'application/json' ||
    m === 'application/xml' ||
    ext === 'csv' ||
    ext === 'md' ||
    ext === 'txt' ||
    ext === 'log' ||
    ext === 'markdown'
  ) {
    return 'text';
  }
  return null;
}
