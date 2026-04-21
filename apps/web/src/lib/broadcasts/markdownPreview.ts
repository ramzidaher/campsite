function safeImageUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return t;
  } catch {
    return null;
  }
}

export function broadcastFirstImage(raw: string): { url: string; alt: string } | null {
  const m = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(raw);
  if (!m) return null;
  const url = safeImageUrl(m[2] ?? '');
  if (!url) return null;
  return { url, alt: (m[1] ?? '').trim() };
}

export function broadcastMarkdownPreview(raw: string, max = 140): string {
  const plain = raw
    // Remove markdown images from text previews; image is rendered separately when available.
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, ' ')
    // Keep link label text only.
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    // Remove fenced code blocks entirely.
    .replace(/```[\s\S]*?```/g, ' ')
    // Keep inline code text.
    .replace(/`([^`]+)`/g, '$1')
    // Drop markdown formatting characters.
    .replace(/^>\s?/gm, '')
    .replace(/#{1,6}\s*/g, '')
    .replace(/[*_~]/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (plain.length === 0) {
    return broadcastFirstImage(raw) ? 'Image attachment' : '';
  }
  if (plain.length <= max) return plain;
  return `${plain.slice(0, max)}...`;
}
