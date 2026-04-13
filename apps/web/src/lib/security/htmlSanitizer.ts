import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = [
  'p',
  'div',
  'span',
  'strong',
  'em',
  'u',
  's',
  'blockquote',
  'ul',
  'ol',
  'li',
  'br',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'a',
];

export function sanitizeOfferHtml(input: string | null | undefined): string {
  return sanitizeHtml(String(input ?? ''), {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      th: ['colspan', 'rowspan'],
      td: ['colspan', 'rowspan'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: {},
    disallowedTagsMode: 'discard',
    parser: {
      decodeEntities: true,
      lowerCaseTags: true,
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer nofollow' }, true),
    },
    enforceHtmlBoundary: true,
  }).trim();
}
