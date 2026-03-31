import type { NextConfig } from 'next';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Next loads `.env*` from `apps/web` only. Merge repo-root `.env*` into `process.env`
// for keys not already set (so local overrides in `apps/web/` still win).
const monorepoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const nodeEnv = process.env.NODE_ENV ?? 'development';
const rootEnvFiles = [
  `.env.${nodeEnv}.local`,
  nodeEnv !== 'test' && '.env.local',
  `.env.${nodeEnv}`,
  '.env',
].filter((f): f is string => Boolean(f));

for (const name of rootEnvFiles) {
  const full = path.join(monorepoRoot, name);
  if (!fs.existsSync(full)) continue;
  const content = fs.readFileSync(full, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  transpilePackages: [
    '@campsite/ui',
    '@campsite/theme',
    '@tiptap/react',
    '@tiptap/starter-kit',
    '@tiptap/markdown',
    '@tiptap/extension-placeholder',
    '@tiptap/extension-bubble-menu',
  ],
  async headers() {
    const base = [
      { key: 'X-DNS-Prefetch-Control', value: 'on' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      {
        key: 'Permissions-Policy',
        value: 'camera=(self), microphone=(), geolocation=()',
      },
    ];
    const hsts =
      process.env.VERCEL_ENV === 'production'
        ? [
            {
              key: 'Strict-Transport-Security',
              value: 'max-age=63072000; includeSubDomains; preload',
            },
          ]
        : [];
    return [{ source: '/:path*', headers: [...base, ...hsts] }];
  },
  webpack: (config, { nextRuntime }) => {
    // Edge middleware forbids eval/new Function. Next sets production `devtool: 'source-map'` for
    // edge by default; toggling devtool alone can leave source-map plugins behind, which still
    // triggers EvalError when handling requests under `next start`.
    if (nextRuntime === 'edge') {
      config.devtool = false;
      if (Array.isArray(config.plugins)) {
        config.plugins = config.plugins.filter((plugin) => {
          const name = (plugin as { constructor?: { name?: string } }).constructor?.name ?? '';
          return (
            name !== 'SourceMapDevToolPlugin' &&
            name !== 'EvalSourceMapDevToolPlugin' &&
            name !== 'EvalDevToolModulePlugin'
          );
        });
      }
    }
    config.resolve.alias = {
      ...config.resolve.alias,
      'react-native$': 'react-native-web',
    };
    config.resolve.extensions = [
      '.web.tsx',
      '.web.ts',
      '.web.js',
      '.tsx',
      '.ts',
      '.js',
      ...(config.resolve.extensions ?? []),
    ];
    return config;
  },
};

export default nextConfig;
