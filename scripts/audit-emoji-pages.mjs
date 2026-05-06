#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const scanRoots = [
  path.join(repoRoot, 'apps/web/src'),
  path.join(repoRoot, 'apps/mobile/app'),
];

const exts = new Set(['.ts', '.tsx', '.js', '.jsx', '.mdx']);
const skipDirs = new Set(['node_modules', '.next', 'dist', 'build', '.git']);
const emojiRegex = /[\p{Extended_Pictographic}\u2600-\u27BF]/u;

async function walk(dir, out = []) {
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (skipDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, out);
      continue;
    }
    if (!exts.has(path.extname(entry.name))) continue;
    out.push(full);
  }
  return out;
}

function toPosixRelative(p) {
  return path.relative(repoRoot, p).split(path.sep).join('/');
}

function inferSurface(relPath) {
  if (relPath.startsWith('apps/web/src/app/')) {
    return `web-route:${routeFromWebAppPath(relPath)}`;
  }
  if (relPath.startsWith('apps/mobile/app/')) {
    return `mobile-route:${routeFromMobileAppPath(relPath)}`;
  }
  if (relPath.startsWith('apps/web/src/components/')) return 'web-component';
  if (relPath.startsWith('apps/mobile/')) return 'mobile-component';
  return 'other';
}

function routeFromWebAppPath(relPath) {
  const raw = relPath.replace(/^apps\/web\/src\/app\//, '');
  const noFile = raw
    .replace(/\/page\.(tsx|ts|jsx|js|mdx)$/, '')
    .replace(/\/layout\.(tsx|ts|jsx|js|mdx)$/, '');
  const segs = noFile
    .split('/')
    .filter(Boolean)
    .filter((s) => !(s.startsWith('(') && s.endsWith(')')));
  const route = '/' + segs.join('/');
  return route === '/' ? '/' : route.replace(/\/+/g, '/');
}

function routeFromMobileAppPath(relPath) {
  const raw = relPath.replace(/^apps\/mobile\/app\//, '');
  const noExt = raw.replace(/\.(tsx|ts|jsx|js|mdx)$/, '');
  const segs = noExt
    .split('/')
    .filter(Boolean)
    .filter((s) => !(s.startsWith('(') && s.endsWith(')')))
    .map((s) => (s === 'index' ? '' : s))
    .filter(Boolean);
  const route = '/' + segs.join('/');
  return route === '/' ? '/' : route.replace(/\/+/g, '/');
}

async function run() {
  const files = [];
  for (const root of scanRoots) {
    await walk(root, files);
  }

  const rows = [];
  for (const abs of files) {
    const rel = toPosixRelative(abs);
    const content = await fs.readFile(abs, 'utf8');
    if (!emojiRegex.test(content)) continue;
    const lines = content.split('\n');
    const lineHits = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (emojiRegex.test(line)) {
        lineHits.push(i + 1);
      }
    }
    rows.push({
      file: rel,
      surface: inferSurface(rel),
      hitCount: lineHits.length,
      lineHits: lineHits.join('|'),
    });
  }

  rows.sort((a, b) => a.file.localeCompare(b.file));

  const outDir = path.join(repoRoot, 'reports', 'route-audit');
  await fs.mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
  const outFile = path.join(outDir, `emoji-audit-${stamp}.csv`);
  const header = 'file,surface,hit_count,line_hits';
  const csv = [
    header,
    ...rows.map((r) => `${r.file},${r.surface},${r.hitCount},"${r.lineHits}"`),
  ].join('\n');
  await fs.writeFile(outFile, csv, 'utf8');

  console.log(`Emoji audit complete: ${rows.length} files with hits`);
  console.log(`Report: ${toPosixRelative(outFile)}`);
}

await run();
