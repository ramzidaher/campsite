/**
 * Safe `url(...)` fragment for CSS `background-image` when the URL may contain
 * quotes, parentheses, or other characters that break unquoted `url()`.
 */
export function cssBackgroundImageUrl(imageUrl: string): string {
  return `url(${JSON.stringify(imageUrl)})`;
}
