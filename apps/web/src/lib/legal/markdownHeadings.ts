/** Stable slug for `id` attributes (matches preview heading anchors). */
export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * Plain text for a heading line (TOC labels). Strips common inline Markdown
 * (`**bold**`, links, `code`, emphasis) so the sidebar does not show raw syntax.
 */
export function headingPlainLabel(raw: string): string {
  let s = raw.trim();
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  for (let i = 0; i < 10; i++) {
    const next = s.replace(/\*\*([\s\S]*?)\*\*/g, '$1').replace(/__([\s\S]*?)__/g, '$1');
    if (next === s) break;
    s = next;
  }
  s = s.replace(/`([^`]*)`/g, '$1');
  s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1');
  s = s.replace(/(?<!_)_([^_\n]+)_(?!_)/g, '$1');
  return s.replace(/\s+/g, ' ').trim();
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
      const text = headingPlainLabel(m3[1].trim());
      if (!text) continue;
      out.push({ level: 3, text, id: slugifyHeading(text) });
    } else if (m2) {
      const text = headingPlainLabel(m2[1].trim());
      if (!text) continue;
      out.push({ level: 2, text, id: slugifyHeading(text) });
    }
  }
  return out;
}
