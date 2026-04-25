#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const reportsDir = path.join(repoRoot, 'reports', 'db-audit');

const args = parseArgs(process.argv.slice(2));
const durationSec = numberArg(args.durationSec, 300);
const intervalSec = numberArg(args.intervalSec, 30);
const commandTimeoutSec = numberArg(args.commandTimeoutSec, 20);
const commandRetries = numberArg(args.commandRetries, 1);
const retryBackoffMs = numberArg(args.retryBackoffMs, 1200);
const useLinked = args.linked !== 'false' && !args.dbUrl;
const dbUrl = args.dbUrl || process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '';
const cliBin = process.env.SUPABASE_CLI_BIN || 'npx';
const cliArgsPrefix = cliBin === 'npx' ? ['supabase@latest'] : [];

if (durationSec <= 0) {
  console.error('durationSec must be > 0');
  process.exit(1);
}
if (intervalSec <= 0) {
  console.error('intervalSec must be > 0');
  process.exit(1);
}
if (commandTimeoutSec <= 0) {
  console.error('commandTimeoutSec must be > 0');
  process.exit(1);
}
if (commandRetries < 0) {
  console.error('commandRetries must be >= 0');
  process.exit(1);
}
if (!useLinked && !dbUrl) {
  console.error(
    'No DB target provided. Use --linked true (default) with a linked Supabase project, or pass --dbUrl.'
  );
  process.exit(1);
}

const checks = [
  'db-stats',
  'long-running-queries',
  'blocking',
  'locks',
  'outliers',
  'index-stats',
];

const startedAt = new Date();
const runStamp = formatStamp(startedAt);
const runDir = path.join(reportsDir, `db-slowwatch-${runStamp}`);
const endsAtMs = startedAt.getTime() + durationSec * 1000;

ensureDir(runDir);

console.log(`DB slowwatch started: ${startedAt.toISOString()}`);
console.log(`Duration: ${durationSec}s, interval: ${intervalSec}s`);
console.log(`Per-check timeout: ${commandTimeoutSec}s`);
console.log(`Target: ${useLinked ? 'linked Supabase project' : 'explicit DB URL'}`);
console.log(`Reports: ${path.relative(repoRoot, runDir)}`);
console.log('');

const samples = [];
const errorDir = path.join(runDir, 'errors');
ensureDir(errorDir);

for (let sampleIndex = 0; ; sampleIndex += 1) {
  const nowMs = Date.now();
  if (nowMs >= endsAtMs && sampleIndex > 0) break;

  const sampleStartedAt = new Date();
  const sample = {
    sampleIndex: sampleIndex + 1,
    startedAt: sampleStartedAt.toISOString(),
    checks: [],
  };

  const secLeft = Math.max(0, Math.round((endsAtMs - nowMs) / 1000));
  console.log(`[sample ${sample.sampleIndex}] collecting diagnostics... (${secLeft}s left)`);
  for (const check of checks) {
    if (Date.now() >= endsAtMs) break;
    const result = await runInspectCommand(check, {
      useLinked,
      dbUrl,
      cliBin,
      cliArgsPrefix,
      timeoutMs: commandTimeoutSec * 1000,
      retries: commandRetries,
      retryBackoffMs,
    });
    sample.checks.push(result);

    const status = result.ok ? 'ok' : 'error';
    const summary = summarizeRows(result.parsed);
    const rowsMsg = summary == null ? 'rows: n/a' : `rows: ${summary}`;
    console.log(`  - ${check}: ${status} (${result.elapsedMs}ms, ${rowsMsg})`);
  }

  samples.push(sample);
  fs.writeFileSync(path.join(runDir, 'samples.json'), JSON.stringify(samples, null, 2), 'utf8');

  if (Date.now() >= endsAtMs) break;
  await sleep(intervalSec * 1000);
}

const finishedAt = new Date();
const report = buildReport({
  startedAt,
  finishedAt,
  durationSec,
  intervalSec,
  totalSamples: samples.length,
  checks,
  samples,
  useLinked,
  dbUrl,
  commandTimeoutSec,
  commandRetries,
});

fs.writeFileSync(path.join(runDir, 'summary.json'), JSON.stringify(report, null, 2), 'utf8');
fs.writeFileSync(path.join(runDir, 'summary.md'), renderMarkdown(report), 'utf8');
writeErrorLogs(samples, errorDir);

console.log('');
console.log(`Done. Summary: ${path.relative(repoRoot, path.join(runDir, 'summary.md'))}`);
console.log(`Raw JSON: ${path.relative(repoRoot, path.join(runDir, 'samples.json'))}`);

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

function numberArg(value, fallback) {
  const n = Number(value ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatStamp(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

async function runInspectCommand(commandName, opts) {
  const started = Date.now();
  /** @type {Array<{attempt: number, exitCode: number | null, elapsedMs: number, stderr: string, timedOut: boolean}>} */
  const attempts = [];
  let finalResult = null;

  for (let attempt = 1; attempt <= opts.retries + 1; attempt += 1) {
    const one = await runInspectAttempt(commandName, opts);
    attempts.push({
      attempt,
      exitCode: one.exitCode,
      elapsedMs: one.elapsedMs,
      stderr: one.stderr,
      timedOut: one.timedOut,
    });
    finalResult = one;
    if (one.ok) break;
    if (attempt <= opts.retries) {
      await sleep(opts.retryBackoffMs * attempt);
    }
  }

  return {
    command: commandName,
    ...finalResult,
    elapsedMs: Date.now() - started,
    attempts,
  };
}

async function runInspectAttempt(commandName, opts) {
  const started = Date.now();
  const fullArgs = [...opts.cliArgsPrefix, 'inspect', 'db', commandName, '-o', 'json'];

  if (opts.useLinked) {
    fullArgs.push('--linked', '--workdir', path.join(repoRoot, 'supabase'));
  } else {
    fullArgs.push('--db-url', opts.dbUrl);
  }

  const proc = spawn(opts.cliBin, fullArgs, {
    cwd: repoRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    proc.kill('SIGTERM');
  }, opts.timeoutMs);

  proc.stdout.on('data', (chunk) => {
    stdout += String(chunk);
  });
  proc.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });

  const exitCode = await new Promise((resolve, reject) => {
    proc.on('error', reject);
    proc.on('close', resolve);
  });
  clearTimeout(timeout);

  const elapsedMs = Date.now() - started;
  const parsed = parseJsonOutput(stdout);

  return {
    ok: exitCode === 0,
    exitCode,
    elapsedMs,
    stdout,
    stderr,
    timedOut,
    parsed,
    rowCount: summarizeRows(parsed),
  };
}

function parseJsonOutput(stdout) {
  const text = stdout.trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function summarizeRows(parsed) {
  if (Array.isArray(parsed)) return parsed.length;
  if (!parsed || typeof parsed !== 'object') return null;
  if (Array.isArray(parsed.result)) return parsed.result.length;
  if (Array.isArray(parsed.rows)) return parsed.rows.length;

  for (const value of Object.values(parsed)) {
    if (Array.isArray(value)) return value.length;
  }
  return null;
}

function buildReport(input) {
  const commandTotals = new Map();
  const findings = [];

  for (const sample of input.samples) {
    for (const check of sample.checks) {
      const key = check.command;
      if (!commandTotals.has(key)) {
        commandTotals.set(key, {
          command: key,
          runs: 0,
          failures: 0,
          avgMs: 0,
          maxMs: 0,
          nonZeroRows: 0,
          lastRowCount: null,
        });
      }

      const agg = commandTotals.get(key);
      agg.runs += 1;
      if (!check.ok) agg.failures += 1;
      agg.maxMs = Math.max(agg.maxMs, check.elapsedMs);
      agg.avgMs += check.elapsedMs;

      if (typeof check.rowCount === 'number') {
        agg.lastRowCount = check.rowCount;
        if (check.rowCount > 0) agg.nonZeroRows += 1;
      }

      if (!check.ok) {
        findings.push(
          `[sample ${sample.sampleIndex}] ${check.command} failed (exit ${check.exitCode}): ${trimLine(check.stderr)}`
        );
      }
      if (check.timedOut) {
        findings.push(`[sample ${sample.sampleIndex}] ${check.command} timed out after command timeout.`);
      }
      if (Array.isArray(check.attempts) && check.attempts.length > 1) {
        findings.push(
          `[sample ${sample.sampleIndex}] ${check.command} required ${check.attempts.length} attempt(s).`
        );
      }

      if (
        (check.command === 'blocking' ||
          check.command === 'long-running-queries' ||
          check.command === 'locks') &&
        typeof check.rowCount === 'number' &&
        check.rowCount > 0
      ) {
        findings.push(
          `[sample ${sample.sampleIndex}] ${check.command} returned ${check.rowCount} row(s) -> possible contention.`
        );
      }
    }
  }

  const commandSummary = [...commandTotals.values()].map((item) => ({
    ...item,
    avgMs: Number((item.avgMs / Math.max(item.runs, 1)).toFixed(2)),
  }));

  return {
    startedAt: input.startedAt.toISOString(),
    finishedAt: input.finishedAt.toISOString(),
    durationSec: input.durationSec,
    intervalSec: input.intervalSec,
    totalSamples: input.totalSamples,
    target: input.useLinked ? 'linked' : 'db-url',
    dbUrlProvided: Boolean(input.dbUrl),
    commandTimeoutSec: input.commandTimeoutSec,
    commandRetries: input.commandRetries,
    commandSummary,
    findings,
    checks: input.checks,
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# DB Slowwatch Report');
  lines.push('');
  lines.push(`- Started: ${report.startedAt}`);
  lines.push(`- Finished: ${report.finishedAt}`);
  lines.push(`- Duration: ${report.durationSec}s`);
  lines.push(`- Interval: ${report.intervalSec}s`);
  lines.push(`- Samples: ${report.totalSamples}`);
  lines.push(`- Target mode: ${report.target}`);
  lines.push(`- Per-check timeout: ${report.commandTimeoutSec}s`);
  lines.push(`- Retries per check: ${report.commandRetries}`);
  lines.push('');
  lines.push('## Command Summary');
  lines.push('');
  lines.push('| Command | Runs | Failures | Avg ms | Max ms | Non-zero samples | Last row count |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');

  for (const row of report.commandSummary) {
    lines.push(
      `| ${row.command} | ${row.runs} | ${row.failures} | ${row.avgMs} | ${row.maxMs} | ${row.nonZeroRows} | ${row.lastRowCount ?? 'n/a'} |`
    );
  }

  lines.push('');
  lines.push('## Findings');
  lines.push('');
  if (!report.findings.length) {
    lines.push('- No immediate contention findings from sampled checks.');
  } else {
    for (const finding of report.findings) {
      lines.push(`- ${finding}`);
    }
  }

  lines.push('');
  lines.push('## Next Steps');
  lines.push('');
  lines.push('- If `blocking`, `locks`, or `long-running-queries` stay non-zero, inspect and cancel/optimize those queries first.');
  lines.push('- If `outliers` and `index-stats` look unhealthy, add missing indexes and re-check this report.');
  lines.push('- Re-run this script during peak traffic and compare reports.');
  lines.push('');

  return lines.join('\n');
}

function trimLine(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

function writeErrorLogs(samples, targetDir) {
  for (const sample of samples) {
    for (const check of sample.checks) {
      if (check.ok && !check.timedOut) continue;
      const filename = `sample-${String(sample.sampleIndex).padStart(3, '0')}-${check.command}.log`;
      const lines = [];
      lines.push(`sample: ${sample.sampleIndex}`);
      lines.push(`command: ${check.command}`);
      lines.push(`ok: ${check.ok}`);
      lines.push(`exitCode: ${check.exitCode}`);
      lines.push(`timedOut: ${check.timedOut}`);
      lines.push(`elapsedMs: ${check.elapsedMs}`);
      lines.push('');
      lines.push('stderr:');
      lines.push(check.stderr || '(empty)');
      lines.push('');
      lines.push('stdout:');
      lines.push(check.stdout || '(empty)');
      lines.push('');
      if (check.attempts?.length) {
        lines.push('attempts:');
        for (const a of check.attempts) {
          lines.push(
            `- attempt=${a.attempt} exitCode=${a.exitCode} timedOut=${a.timedOut} elapsedMs=${a.elapsedMs} stderr=${trimLine(a.stderr)}`
          );
        }
      }
      fs.writeFileSync(path.join(targetDir, filename), lines.join('\n'), 'utf8');
    }
  }
}
