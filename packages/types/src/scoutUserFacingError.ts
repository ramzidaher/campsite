/** Errors we generate locally  safe to show as-is (no vendor URLs or codes). */
const INTERNAL_SCOUT_ERROR = new Set([
  'Invalid response from AI service',
  'No summary returned; try again or shorten the message.',
  'No summary returned; try again.',
  'No reply returned; try a shorter question.',
  'Invalid conversation: last message must be from the user.',
  'Could not get a reply.',
  'Network error.',
  'Network error. Check your connection and try again.',
  'No reply returned.',
  'Could not summarise this broadcast.',
  'No summary was returned. Try again.',
]);

/**
 * Maps raw Google AI / network errors to short, user-safe copy for Scout.
 * Never surfaces URLs, HTTP status text, or Vertex / quota implementation details.
 */
export function userFacingScoutError(raw: string): string {
  const t = raw.trim();
  if (INTERNAL_SCOUT_ERROR.has(t)) return t;
  // Idempotent: already sanitized for display.
  if (
    (t.startsWith('Scout ') || t.startsWith('The request took too long')) &&
    t.length < 220
  ) {
    return t;
  }

  const s = t.toLowerCase();
  if (
    s.includes('resource exhausted') ||
    /\b429\b/.test(s) ||
    s.includes('too many requests') ||
    s.includes('rate limit') ||
    s.includes('quota') ||
    s.includes('capacity') ||
    s.includes('exhausted')
  ) {
    return 'Scout is busy right now. Please wait a moment and try again.';
  }
  if (
    s.includes('permission denied') ||
    /\b403\b/.test(s) ||
    s.includes('api key not valid') ||
    s.includes('invalid api key')
  ) {
    return 'Scout could not be reached. Please try again later.';
  }
  if (
    s.includes('timeout') ||
    s.includes('timed out') ||
    s.includes('deadline exceeded') ||
    s.includes('aborted') ||
    s.includes('econnreset') ||
    s.includes('socket hang up') ||
    s.includes('failed to fetch')
  ) {
    return 'The request took too long. Please try again with a shorter question.';
  }
  if (s.includes('safety') || s.includes('blocked') || s.includes('harmful')) {
    return 'Scout could not answer this. Try rephrasing your question.';
  }
  if (
    s.includes('http') ||
    s.includes('google.com') ||
    s.includes('vertex') ||
    s.includes('generativelanguage') ||
    t.length > 120
  ) {
    return 'Scout could not answer right now. Please try again in a moment.';
  }
  return 'Scout could not answer right now. Please try again in a moment.';
}
