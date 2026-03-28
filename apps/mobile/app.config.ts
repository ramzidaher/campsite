import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import type { ExpoConfig, ConfigContext } from 'expo/config';

// Monorepo: Expo only auto-loads `apps/mobile/.env`; merge repo-root `.env` with web.
loadEnv({ path: path.resolve(__dirname, '../../.env') });

function supabasePublicKey(): string {
  return (
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    ''
  );
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Campsite',
  slug: 'campsite',
  scheme: 'campsite',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'automatic',
  splash: {
    image: './assets/images/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#faf9f6',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.commongroundstudios.campsite',
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundColor: '#faf9f6',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    package: 'com.commongroundstudios.campsite',
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-notifications',
      {
        icon: './assets/images/icon.png',
        color: '#1D4ED8',
        sounds: [],
      },
    ],
  ],
  experiments: {
    // Off in monorepos: @expo/cli resolves `expo-router` from repo root `node_modules`,
    // where npm workspaces does not hoist the app-only dependency (MODULE_NOT_FOUND).
    typedRoutes: false,
  },
  extra: {
    eas: {
      projectId: process.env.EAS_PROJECT_ID ?? '00000000-0000-0000-0000-000000000000',
    },
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    supabaseAnonKey: supabasePublicKey(),
    /** Optional: match web tenant branding (see AuthOrgCard on web). */
    orgSlug: process.env.EXPO_PUBLIC_ORG_SLUG ?? '',
    orgDisplayName: process.env.EXPO_PUBLIC_ORG_DISPLAY_NAME ?? '',
    orgHostLabel: process.env.EXPO_PUBLIC_ORG_HOST_LABEL ?? '',
    /** Public web app origin (no trailing slash) — privacy link on mobile landing, optional. */
    siteUrl: process.env.EXPO_PUBLIC_SITE_URL ?? '',
  },
});
