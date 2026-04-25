#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const reportsRoot = path.join(repoRoot, 'reports');
const dbAuditRoot = path.join(reportsRoot, 'db-audit');
const incidentRoot = path.join(reportsRoot, 'incident');

const args = parseArgs(process.argv.slice(2));
const dbSummaryPath = args.dbSummary || findLatest(path.join(dbAuditRoot), 'summary.json');
const k6SummaryPath = args.k6Summary || '';
const apiLogPath = args.apiLog || '';
const outputDir = args.outDir || path.join(incidentRoot, `incident-${stamp(new Date())}`);
const captureInspect = args.captureInspect !== 'false';
const inspectMode = args.inspectMode || 'linked';
const inspectDbUrl = args.dbUrl || process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '';

ensureDir(outputDir);

const db = dbSummaryPath ? readJsonSafe(dbSummaryPath) : null;
const k6 = k6SummaryPath ? readJsonSafe(k6SummaryPath) : null;
const apiLog = apiLogPath ? readTextSafe(apiLogPath) : '';
const inspect = captureInspect
  ? await captureSupabaseInspect(outputDir, { inspectMode, inspectDbUrl })
  : null;

const diagnosis = buildDiagnosis({
  db,
  k6,
  apiLog,
  dbSummaryPath,
  k6SummaryPath,
  apiLogPath,
  inspect,
});
fs.writeFileSync(path.join(outputDir, 'incident-summary.json'), JSON.stringify(diagnosis, null, 2), 'utf8');
fs.writeFileSync(path.join(outputDir, 'incident-summary.md'), renderMarkdown(diagnosis), 'utf8');

console.log(`Incident report written: ${path.relative(repoRoot, path.join(outputDir, 'incident-summary.md'))}`);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
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

function stamp(d) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
}

function findLatest(dir, fileName) {
  if (!fs.existsSync(dir)) return '';
  const dirs = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(dir, d.name))
    .filter((p) => fs.existsSync(path.join(p, fileName)))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  if (!dirs.length) return '';
  return path.join(dirs[0], fileName);
}

function readJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function readTextSafe(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

async function captureSupabaseInspect(outputDir, opts) {
  const inspectDir = path.join(outputDir, 'supabase-inspect');
  ensureDir(inspectDir);

  const commands = ['outliers', 'calls', 'blocking', 'index-stats'];
  const results = [];
  for (const command of commands) {
    const result = await runInspectCommand(command, opts);
    const fileBase = command.replace(/[^a-z0-9-]/gi, '_');
    fs.writeFileSync(path.join(inspectDir, `${fileBase}.json`), result.stdout || '{}', 'utf8');
    if (!result.ok) {
      fs.writeFileSync(path.join(inspectDir, `${fileBase}.stderr.log`), result.stderr || '', 'utf8');
    }
    results.push(result);
  }

  fs.writeFileSync(path.join(inspectDir, 'manifest.json'), JSON.stringify(results, null, 2), 'utf8');
  return {
    inspectDir,
    results,
    parsed: Object.fromEntries(results.map((r) => [r.command, parseJsonSafe(r.stdout)])),
  };
}

async function runInspectCommand(command, opts) {
  const args = ['supabase@latest', 'inspect', 'db', command, '-o', 'json'];
  if (opts.inspectMode === 'db-url' && opts.inspectDbUrl) {
    args.push('--db-url', opts.inspectDbUrl);
  } else {
    args.push('--linked', '--workdir', path.join(repoRoot, 'supabase'));
  }

  const proc = spawn('npx', args, {
    cwd: repoRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
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

  return {
    command,
    ok: exitCode === 0,
    exitCode,
    stdout: stdout.trim() || '{}',
    stderr: stderr.trim(),
  };
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function buildDiagnosis(input) {
  const priorities = [];
  const evidence = [];
  const actions = [];

  if (input.db?.commandSummary) {
    const byName = new Map(input.db.commandSummary.map((c) => [c.command, c]));
    const blocking = byName.get('blocking');
    const locks = byName.get('locks');
    const longQ = byName.get('long-running-queries');
    const outliers = byName.get('outliers');

    if ((blocking?.nonZeroRows ?? 0) > 0 || (locks?.nonZeroRows ?? 0) > 0 || (longQ?.nonZeroRows ?? 0) > 0) {
      priorities.push('DB contention detected (blocking/locks/long-running queries).');
      actions.push('Identify and terminate/optimize blocking sessions first; reduce transaction scope.');
    }
    if ((outliers?.failures ?? 0) > 0 || (outliers?.maxMs ?? 0) > 5000) {
      priorities.push('Slow query outliers are elevated.');
      actions.push('Collect top pg_stat_statements fingerprints and add tenant-scoped indexes.');
    }
    if (input.db.findings?.length) {
      evidence.push(...input.db.findings.slice(0, 15));
    }
  } else {
    priorities.push('No DB slowwatch summary found.');
    actions.push('Run `npm run db:slowwatch` during peak load window and regenerate incident report.');
  }

  if (input.k6?.metrics) {
    const failedRate = metricValue(input.k6.metrics.http_req_failed, 'rate');
    const p95 = metricValue(input.k6.metrics.http_req_duration, 'p(95)');
    const p99 = metricValue(input.k6.metrics.http_req_duration, 'p(99)');
    const rpcTimeoutRate = metricValue(input.k6.metrics.rpc_timeout_rate, 'rate');
    const rpcNon200Rate = metricValue(input.k6.metrics.rpc_non_200_rate, 'rate');
    const rpcTimeoutCount = metricValue(input.k6.metrics.rpc_timeouts, 'count');
    if (failedRate != null && failedRate > 0.01) {
      priorities.push(`Load-test failure rate high (${(failedRate * 100).toFixed(2)}%).`);
      actions.push('Apply backpressure and request shedding on hot endpoints to protect core flows.');
    }
    if (p95 != null && p95 > 900) {
      priorities.push(`Load-test latency high (p95 ${Math.round(p95)}ms, p99 ${Math.round(p99 ?? 0)}ms).`);
      actions.push('Tune query plans and connection usage, then rerun same scenario for before/after comparison.');
    }
    if (rpcTimeoutRate != null && rpcTimeoutRate > 0.2) {
      priorities.push(`RPC timeout rate is critical (${(rpcTimeoutRate * 100).toFixed(2)}%).`);
      actions.push('Reduce shell RPC concurrency/complexity and enforce fail-soft cached fallback paths.');
    }
    evidence.push(
      `k6 http_req_failed rate=${failedRate ?? 'n/a'} p95=${p95 ?? 'n/a'} p99=${p99 ?? 'n/a'} rpc_timeout_rate=${rpcTimeoutRate ?? 'n/a'} rpc_non_200_rate=${rpcNon200Rate ?? 'n/a'} rpc_timeouts=${rpcTimeoutCount ?? 'n/a'}`
    );
  }

  if (input.apiLog) {
    const errorMatches = [...input.apiLog.matchAll(/\b(500|timeout|timed out|internal server error)\b/gi)].length;
    evidence.push(`API log signal count (500/timeout/internal): ${errorMatches}`);
    if (errorMatches > 0) {
      actions.push('Correlate failing request IDs with DB sample timestamps to map route->query bottlenecks.');
    }
  }

  if (input.inspect?.results) {
    const failedInspect = input.inspect.results.filter((r) => !r.ok).length;
    if (failedInspect > 0) {
      priorities.push(`Supabase inspect capture had ${failedInspect} failed command(s).`);
      actions.push('Review supabase-inspect/*.stderr.log and rerun capture once connectivity is stable.');
    }

    const outliers = normalizeRows(input.inspect.parsed?.outliers);
    const calls = normalizeRows(input.inspect.parsed?.calls);
    const blocking = normalizeRows(input.inspect.parsed?.blocking);

    if (blocking.length > 0) {
      priorities.push(`Blocking queries detected (${blocking.length} row(s)).`);
      evidence.push(`inspect blocking rows=${blocking.length}`);
      actions.push('Capture blocking pid/query pairs and terminate offending sessions during incidents.');
    }

    const topOutlier = outliers[0];
    if (topOutlier) {
      const queryPreview = String(topOutlier.query || topOutlier.normalized_query || '').replace(/\s+/g, ' ').slice(0, 140);
      evidence.push(
        `top outlier total_exec_time=${topOutlier.total_exec_time ?? topOutlier.total_time ?? 'n/a'} calls=${topOutlier.calls ?? 'n/a'} query="${queryPreview}"`
      );
      actions.push('Optimize top outlier query plan and add targeted composite indexes for its filter/join keys.');
    }

    const topCall = calls[0];
    if (topCall) {
      evidence.push(
        `top call volume calls=${topCall.calls ?? 'n/a'} mean_exec_time=${topCall.mean_exec_time ?? topCall.mean_time ?? 'n/a'}`
      );
    }
  }

  if (!actions.length) {
    actions.push('Collect more load + DB evidence; current inputs are insufficient for a solid fix.');
  }

  return {
    generatedAt: new Date().toISOString(),
    inputs: {
      dbSummaryPath: input.dbSummaryPath || null,
      k6SummaryPath: input.k6SummaryPath || null,
      apiLogPath: input.apiLogPath || null,
      inspectDir: input.inspect?.inspectDir || null,
    },
    priorities: unique(priorities),
    evidence: unique(evidence),
    actions: unique(actions),
  };
}

function normalizeRows(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return [];
  if (Array.isArray(parsed.rows)) return parsed.rows;
  if (Array.isArray(parsed.result)) return parsed.result;
  for (const value of Object.values(parsed)) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function metricValue(metric, key) {
  if (!metric || typeof metric !== 'object') return null;
  if (metric.values && typeof metric.values === 'object' && metric.values[key] != null) {
    return metric.values[key];
  }
  if (metric[key] != null) return metric[key];
  if (key === 'rate' && metric.value != null) return metric.value;
  if (key === 'count' && metric.value != null) return metric.value;
  return null;
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Incident Summary');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Priority Findings');
  lines.push('');
  for (const p of report.priorities) lines.push(`- ${p}`);
  if (!report.priorities.length) lines.push('- No critical findings detected from provided inputs.');
  lines.push('');
  lines.push('## Evidence');
  lines.push('');
  for (const e of report.evidence) lines.push(`- ${e}`);
  if (!report.evidence.length) lines.push('- No evidence items available.');
  lines.push('');
  lines.push('## Action Plan');
  lines.push('');
  for (const a of report.actions) lines.push(`- ${a}`);
  return lines.join('\n');
}
