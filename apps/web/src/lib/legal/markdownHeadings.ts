/** Stable slug for `id` attributes (matches preview heading anchors). */
export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export type MarkdownHeading = { level: 2 | 3; text: string; id: string };

/** Extract `##` / `###` headings from Markdown source. */
export function extractMarkdownHeadings(md: string): MarkdownHeading[] {
  const lines = md.split(/\r?\n/);
  const out: MarkdownHeading[] = [];
  for (const line of lines) {
    const m3 = /^###\s+(.+)$/.exec(line);
    const m2 = /^##\s+(.+)$/.exec(line);
    if (m3) {
      const text = m3[1].trim();
      out.push({ level: 3, text, id: slugifyHeading(text) });
    } else if (m2) {
      const text = m2[1].trim();
      out.push({ level: 2, text, id: slugifyHeading(text) });
    }
  }
  return out;
}
