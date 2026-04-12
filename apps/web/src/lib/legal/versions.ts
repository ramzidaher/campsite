/**
 * @deprecated Use `loadPlatformLegalSettings` / DB `platform_legal_settings` for live values.
 * These match `fallbackDefaults` for backwards compatibility when importing bundle strings in isolation.
 */
import { FALLBACK_LEGAL_SETTINGS } from '@/lib/legal/fallbackDefaults';

export const LEGAL_BUNDLE_VERSION = FALLBACK_LEGAL_SETTINGS.bundle_version;
export const LEGAL_EFFECTIVE_DATE_LABEL = FALLBACK_LEGAL_SETTINGS.effective_label;
