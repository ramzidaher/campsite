/**
 * Whether the user’s primary modifier for app shortcuts is ⌘ (Apple) vs Ctrl (everywhere else).
 * Used so the command-palette hint matches the physical keyboard (Chromebook, Windows, Linux, etc.).
 */
export function usesAppleCommandKey(): boolean {
  if (typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent ?? '';

  // Chrome OS / Chromebooks  Ctrl-based shortcuts (no Command key)
  if (/CrOS/i.test(ua)) return false;

  // Chromium User-Agent Client Hints (preferred when available)
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string; getHighEntropyValues?: (keys: string[]) => Promise<{ platform?: string }> };
  };
  const platCH = nav.userAgentData?.platform;
  if (platCH) {
    if (platCH === 'macOS' || platCH === 'iOS') return true;
    // Windows, Linux, Android, Chrome OS, etc.
    return false;
  }

  // Legacy `navigator.platform` (deprecated but still widely populated)
  const legacy = navigator.platform ?? '';
  if (/^Mac|^iPhone|^iPad|^iPod/i.test(legacy)) return true;

  // Win32, Win64, Linux armv81, Android, etc. → Ctrl
  return false;
}

/** Short string shown on the search pill (⌘K vs Ctrl+K). */
export function getCommandPaletteShortcutHint(): string {
  if (typeof navigator === 'undefined') return 'Ctrl+K';
  return usesAppleCommandKey() ? '⌘K' : 'Ctrl+K';
}
