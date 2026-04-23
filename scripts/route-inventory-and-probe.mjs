#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const appDir = path.join(repoRoot, 'apps', 'web', 'src', 'app');
const reportsDir = path.join(repoRoot, 'reports', 'route-audit');

const args = parseArgs(process.argv.slice(2));
const mode = args.mode ?? 'all';
const port = Number(args.port ?? 3000);
const orgSlug = String(args.org ?? 'demo');
const timeoutMs = Number(args.timeoutMs ?? 12000);
const baseHost = String(args.baseHost ?? 'localhost');
const adminHost = String(args.adminHost ?? `admin.localhost:${port}`);
const includeDynamic = args.includeDynamic !== 'false';
const openVariants = String(args.openVariants ?? 'preferred');
const openDelayMs = Number(args.openDelayMs ?? 150);

const now = new Date();
const stamp = formatStamp(now);

ensureDir(reportsDir);

const inventory = buildRouteInventory({
  appDir,
  port,
  orgSlug,
  baseHost,
  adminHost,
  includeDynamic,
});

const inventoryCsvPath = path.join(reportsDir, `route-inventory-${stamp}.csv`);
writeCsv(inventoryCsvPath, inventoryToCsvRows(inventory));

console.log(`Inventory routes: ${inventory.length}`);
console.log(`Inventory CSV: ${inventoryCsvPath}`);

if (mode === 'inventory') {
  process.exit(0);
}

if (mode === 'open') {
  const urls = collectOpenUrls(inventory, openVariants);
  const browserLog = await openAllInBrowser(urls, openDelayMs);
  const browserLogCsvPath = path.join(reportsDir, `route-browser-open-${stamp}.csv`);
  writeCsv(browserLogCsvPath, browserLog);
  console.log(`Opened links: ${browserLog.length}`);
  console.log(`Browser open log CSV: ${browserLogCsvPath}`);
  process.exit(0);
}

const probeResults = await probeAll(inventory, timeoutMs);
const probeCsvPath = path.join(reportsDir, `route-probe-results-${stamp}.csv`);
const probeJsonPath = path.join(reportsDir, `route-probe-results-${stamp}.json`);

writeCsv(probeCsvPath, probeToCsvRows(probeResults));
fs.writeFileSync(probeJsonPath, JSON.stringify(probeResults, null, 2), 'utf8');

console.log(`Probe results: ${probeResults.length}`);
console.log(`Probe CSV: ${probeCsvPath}`);
console.log(`Probe JSON: ${probeJsonPath}`);

const summary = summarizeProbeResults(probeResults);
console.log(
  `Summary => ok:${summary.ok} redirect:${summary.redirect} accessDenied:${summary.accessDenied} error:${summary.error}`
);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.replace(/^--/, '');
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = 'true';
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function walk(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else {
        out.push(full);
      }
    }
  }
  return out;
}

function normalizeRoutePath(routeFile, appRoot) {
  const rel = path.relative(appRoot, routeFile).replaceAll(path.sep, '/');
  const parts = rel.split('/');
  parts.pop();

  const cleanParts = parts.filter((p) => !(p.startsWith('(') && p.endsWith(')')));
  let routePath = `/${cleanParts.join('/')}`;
  routePath = routePath.replace(/\/+/g, '/');
  if (routePath === '/index') routePath = '/';
  if (routePath.length > 1 && routePath.endsWith('/')) routePath = routePath.slice(0, -1);
  if (routePath === '') routePath = '/';
  return routePath;
}

function routeType(file) {
  if (file.endsWith('/page.tsx')) return 'page';
  if (file.endsWith('/route.ts')) return 'api';
  return 'other';
}

function hasDynamicSegment(routePath) {
  return routePath.includes('[') && routePath.includes(']');
}

function materializeDynamicPath(routePath) {
  return routePath.replace(/\[\.\.\.[^\]]+\]/g, 'example').replace(/\[[^\]]+\]/g, 'example');
}

function buildUrls(routePath, kind, opts) {
  const { port: p, orgSlug: org, baseHost: base, adminHost: admin } = opts;
  const localBase = `http://${base}:${p}`;
  const orgBase = `http://${org}.localhost:${p}`;
  const adminBase = `http://${admin}`;

  const pathForUrl = routePath.startsWith('/') ? routePath : `/${routePath}`;
  const defaultUrl = `${localBase}${pathForUrl}`;
  const orgUrl = `${orgBase}${pathForUrl}`;
  const adminUrl = `${adminBase}${pathForUrl}`;

  // Candidate careers routes are public and typically live on org host.
  const preferredUrl =
    pathForUrl === '/founders' || pathForUrl.startsWith('/founders/')
      ? adminUrl
      : pathForUrl.startsWith('/jobs')
      ? orgUrl
      : defaultUrl;

  return { preferredUrl, defaultUrl, orgUrl, adminUrl, kind };
}

function buildRouteInventory(opts) {
  const files = walk(opts.appDir).filter((f) => f.endsWith('/page.tsx') || f.endsWith('/route.ts'));
  const rows = [];

  for (const file of files) {
    const kind = routeType(file);
    const routePath = normalizeRoutePath(file, opts.appDir);
    const isDynamic = hasDynamicSegment(routePath);
    if (isDynamic && !opts.includeDynamic) continue;

    const concretePath = isDynamic ? materializeDynamicPath(routePath) : routePath;
    const urls = buildUrls(concretePath, kind, opts);
    rows.push({
      kind,
      routePath,
      concretePath,
      isDynamic,
      file: path.relative(repoRoot, file).replaceAll(path.sep, '/'),
      preferredUrl: urls.preferredUrl,
      localhostUrl: urls.defaultUrl,
      orgSubdomainUrl: urls.orgUrl,
      adminHostUrl: urls.adminUrl,
      notes: isDynamic ? 'Dynamic route converted with placeholder "example"' : '',
    });
  }

  rows.sort((a, b) => a.concretePath.localeCompare(b.concretePath) || a.kind.localeCompare(b.kind));
  return rows;
}

function inventoryToCsvRows(inventory) {
  return inventory.map((r) => ({
    kind: r.kind,
    routePath: r.routePath,
    concretePath: r.concretePath,
    isDynamic: String(r.isDynamic),
    preferredUrl: r.preferredUrl,
    localhostUrl: r.localhostUrl,
    orgSubdomainUrl: r.orgSubdomainUrl,
    adminHostUrl: r.adminHostUrl,
    sourceFile: r.file,
    notes: r.notes,
  }));
}

function collectOpenUrls(inventory, variantMode) {
  const unique = new Set();
  const out = [];

  for (const row of inventory) {
    if (variantMode === 'all') {
      const candidates = [row.localhostUrl, row.orgSubdomainUrl, row.adminHostUrl];
      for (const url of candidates) {
        if (unique.has(url)) continue;
        unique.add(url);
        out.push({ url, routePath: row.routePath, hostVariant: hostVariantFor(url) });
      }
      continue;
    }

    if (!unique.has(row.preferredUrl)) {
      unique.add(row.preferredUrl);
      out.push({
        url: row.preferredUrl,
        routePath: row.routePath,
        hostVariant: hostVariantFor(row.preferredUrl),
      });
    }
  }

  return out;
}

function hostVariantFor(url) {
  if (url.includes('admin.localhost')) return 'adminHost';
  if (url.includes('.localhost:')) return 'orgSubdomain';
  return 'localhost';
}

async function openAllInBrowser(urlRows, delayMs) {
  const results = [];
  for (let i = 0; i < urlRows.length; i += 1) {
    const row = urlRows[i];
    const openedAt = new Date().toISOString();
    const openResult = await openUrlInBrowser(row.url);
    results.push({
      index: String(i + 1),
      url: row.url,
      routePath: row.routePath,
      hostVariant: row.hostVariant,
      openedAt,
      opened: String(openResult.opened),
      error: openResult.error,
    });
    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }
  return results;
}

async function openUrlInBrowser(url) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  if (command === 'start') {
    // On Windows `start` is a shell builtin, keep behavior explicit.
    return {
      opened: false,
      error: 'Windows shell builtin "start" is not supported by this script runtime.',
    };
  }
  return new Promise((resolve) => {
    const child = spawn(command, [url], { stdio: 'ignore' });
    child.on('error', (err) => resolve({ opened: false, error: err.message }));
    child.on('exit', (code) => {
      if (code === 0) resolve({ opened: true, error: '' });
      else resolve({ opened: false, error: `${command} exited with code ${code ?? -1}` });
    });
  });
}

async function probeAll(inventory, timeoutMsParam) {
  const results = [];
  for (const row of inventory) {
    const result = await probeOne(row.preferredUrl, timeoutMsParam);
    results.push({
      kind: row.kind,
      routePath: row.routePath,
      concretePath: row.concretePath,
      url: row.preferredUrl,
      localhostUrl: row.localhostUrl,
      orgSubdomainUrl: row.orgSubdomainUrl,
      adminHostUrl: row.adminHostUrl,
      sourceFile: row.file,
      ...result,
    });
  }
  return results;
}

async function probeOne(url, timeoutMsParam) {
  const startedAt = new Date().toISOString();
  const timer = AbortSignal.timeout(timeoutMsParam);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: timer,
      headers: {
        'user-agent': 'route-audit-script/1.0',
      },
    });

    const text = await response.text();
    const bodyLower = text.toLowerCase();
    const location = response.headers.get('location') ?? '';
    const deniedHint =
      response.status === 401 ||
      response.status === 403 ||
      bodyLower.includes('access denied') ||
      bodyLower.includes('unauthorized') ||
      bodyLower.includes('forbidden');

    let outcome = 'ok';
    if (response.status >= 300 && response.status < 400) outcome = 'redirect';
    if (deniedHint) outcome = 'accessDenied';
    if (response.status >= 500) outcome = 'serverError';

    return {
      checkedAt: startedAt,
      ok: response.ok,
      outcome,
      status: response.status,
      statusText: response.statusText,
      redirectedTo: location,
      contentType: response.headers.get('content-type') ?? '',
      bodySample: sanitizeForCsv(text.slice(0, 220)),
      error: '',
    };
  } catch (error) {
    return {
      checkedAt: startedAt,
      ok: false,
      outcome: 'error',
      status: 0,
      statusText: '',
      redirectedTo: '',
      contentType: '',
      bodySample: '',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function summarizeProbeResults(results) {
  const summary = {
    ok: 0,
    redirect: 0,
    accessDenied: 0,
    error: 0,
  };
  for (const r of results) {
    if (r.outcome === 'ok') summary.ok += 1;
    else if (r.outcome === 'redirect') summary.redirect += 1;
    else if (r.outcome === 'accessDenied') summary.accessDenied += 1;
    else if (r.outcome === 'error' || r.outcome === 'serverError') summary.error += 1;
  }
  return summary;
}

function probeToCsvRows(results) {
  return results.map((r) => ({
    kind: r.kind,
    routePath: r.routePath,
    concretePath: r.concretePath,
    url: r.url,
    outcome: r.outcome,
    ok: String(r.ok),
    status: String(r.status),
    statusText: r.statusText,
    redirectedTo: r.redirectedTo,
    contentType: r.contentType,
    error: r.error,
    bodySample: r.bodySample,
    checkedAt: r.checkedAt,
    sourceFile: r.sourceFile,
    localhostUrl: r.localhostUrl,
    orgSubdomainUrl: r.orgSubdomainUrl,
    adminHostUrl: r.adminHostUrl,
  }));
}

function writeCsv(targetPath, rows) {
  if (rows.length === 0) {
    fs.writeFileSync(targetPath, '', 'utf8');
    return;
  }
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    const values = headers.map((h) => csvEscape(String(row[h] ?? '')));
    lines.push(values.join(','));
  }
  fs.writeFileSync(targetPath, `${lines.join('\n')}\n`, 'utf8');
}

function csvEscape(value) {
  const escaped = value.replaceAll('"', '""');
  if (/[",\n\r]/.test(escaped)) {
    return `"${escaped}"`;
  }
  return escaped;
}

function sanitizeForCsv(s) {
  return s.replace(/\s+/g, ' ').trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatStamp(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}
