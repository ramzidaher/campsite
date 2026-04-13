import { getCommandPaletteShortcutHint, usesAppleCommandKey } from '@/lib/platform/commandPaletteShortcut';

describe('commandPaletteShortcut', () => {
  const originalUA = navigator.userAgent;
  const originalPlatform = navigator.platform;
  const originalUAData = (navigator as Navigator & { userAgentData?: unknown }).userAgentData;

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', { value: originalUA, configurable: true });
    Object.defineProperty(navigator, 'platform', { value: originalPlatform, configurable: true });
    Object.defineProperty(navigator, 'userAgentData', { value: originalUAData, configurable: true });
  });

  it('uses Ctrl on Chrome OS / Chromebook (CrOS in UA)', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      configurable: true,
    });
    Object.defineProperty(navigator, 'platform', { value: 'Linux', configurable: true });
    expect(usesAppleCommandKey()).toBe(false);
    expect(getCommandPaletteShortcutHint()).toBe('Ctrl+K');
  });

  it('uses Ctrl on Windows', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      configurable: true,
    });
    Object.defineProperty(navigator, 'platform', { value: 'Win32', configurable: true });
    expect(usesAppleCommandKey()).toBe(false);
    expect(getCommandPaletteShortcutHint()).toBe('Ctrl+K');
  });

  it('uses ⌘ on macOS (legacy platform)', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      configurable: true,
    });
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true });
    expect(usesAppleCommandKey()).toBe(true);
    expect(getCommandPaletteShortcutHint()).toBe('⌘K');
  });

  it('respects userAgentData.platform when present', () => {
    Object.defineProperty(navigator, 'userAgentData', {
      value: { platform: 'macOS' },
      configurable: true,
    });
    Object.defineProperty(navigator, 'platform', { value: 'Win32', configurable: true });
    expect(usesAppleCommandKey()).toBe(true);
  });
});
