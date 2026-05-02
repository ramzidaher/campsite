#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const targetDir = path.join(root, 'apps', 'web', 'src');
const allowedExt = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const forbidden = /toLocale(?:DateString|String|TimeString)\(\s*(?:undefined|\[\])/g;

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath);
      continue;
    }
    if (entry.isFile() && allowedExt.has(path.extname(entry.name))) {
      yield fullPath;
    }
  }
}

const failures = [];

for await (const filePath of walk(targetDir)) {
  const content = await readFile(filePath, 'utf8');
  forbidden.lastIndex = 0;
  const match = forbidden.exec(content);
  if (!match) continue;

  const prefix = content.slice(0, match.index);
  const line = prefix.split('\n').length;
  failures.push(`${path.relative(root, filePath)}:${line} -> ${match[0]}`);
}

if (failures.length > 0) {
  console.error('Found non-deterministic locale date formatting calls:');
  for (const issue of failures) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log('Stable date formatting check passed.');
