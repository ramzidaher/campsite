#!/usr/bin/env node

import { createServerClient } from '@supabase/ssr';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const reportsRoot = path.join(repoRoot, 'reports', 'incident');

const DEFAULT_USERS_CSV = path.join(repoRoot, 'scripts', 'ussu-provision-output', 'ussu-password-import.csv');
const DEFAULT_BASE_URL = 'https://camp-site.co.uk';
const DEFAULT_ROUTE_POOL = [
  { label: 'tenant_dashboard', target: '$tenantDashboard' },
  { label: 'profile', target: '/profile' },
  { label: 'hr_home', target: '/hr' },
  { label: 'hr_records', target: '/hr/records' },
  { label: 'hr_performance', target: '/hr/performance' },
  { label: 'hr_onboarding', target: '/hr/onboarding' },
  { label: 'hr_org_chart', target: '/hr/org-chart' },
  { label: 'hr_hiring', target: '/hr/hiring' },
  { label: 'hr_hiring_requests', target: '/hr/hiring/requests' },
  { label: 'hr_hiring_jobs', target: '/hr/hiring/jobs' },
  { label: 'hr_hiring_applications', target: '/hr/hiring/applications' },
  { label: 'hr_hiring_interviews', target: '/hr/hiring/interviews' },
  { label: 'hr_hiring_templates', target: '/hr/hiring/templates' },
  { label: 'hr_metric_alerts', target: '/hr/hr-metric-alerts' },
];
const DEFAULT_HEADERS = {
  'User-Agent': 'CampSiteProdRouteThrash/1.0',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};
const SNIPPET_LIMIT = 240;

const args = parseArgs(process.argv.slice(2));
if (args.help === 'true') {
  printHelp();
  process.exit(0);
}

const config = buildConfig(args);
const env = loadEnv(path.join(repoRoot, '.env'));
const runtime = createRuntime(config);

try {
  await main({ config, env, runtime });
} catch (error) {
  console.error(formatError(error));
  process.exitCode = 1;
}

async function main({ config, env, runtime }) {
  ensureDir(config.outDir);
  const publicKey = getSupabasePublicKey(env);
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !publicKey) {
    throw new Error(
      'Missing Supabase env in .env. Need NEXT_PUBLIC_SUPABASE_URL and one public key (NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY).'
    );
  }

  const selectedRoutes = loadRoutePool(config.routesFile);
  const users = selectUsers(loadUsersCsv(config.usersCsv), config, runtime.rand);
  if (!users.length) {
    throw new Error('No users matched the requested filters.');
  }

  const configSnapshot = {
    baseUrl: config.baseUrl,
    usersCsv: relativeToRepo(config.usersCsv),
    routesFile: config.routesFile ? relativeToRepo(config.routesFile) : null,
    concurrency: config.concurrency,
    maxUsers: config.maxUsers,
    iterationsPerUser: config.iterationsPerUser,
    pageTimeoutMs: config.pageTimeoutMs,
    shellTimeoutMs: config.shellTimeoutMs,
    minThinkMs: config.minThinkMs,
    maxThinkMs: config.maxThinkMs,
    slowMs: config.slowMs,
    shellEvery: config.shellEvery,
    seed: config.seed,
    selectedUsers: users.map((user) => ({
      name: user.name,
      email: user.email,
      loginUrl: user.loginUrl,
      note: user.note,
    })),
    selectedRoutes,
  };
  fs.writeFileSync(path.join(config.outDir, 'run-config.json'), `${JSON.stringify(configSnapshot, null, 2)}\n`, 'utf8');

  runtime.emit('run_started', {
    config: {
      baseUrl: config.baseUrl,
      concurrency: config.concurrency,
      maxUsers: config.maxUsers,
      iterationsPerUser: config.iterationsPerUser,
      shellEvery: config.shellEvery,
      seed: config.seed,
    },
    selectedUsers: users.map((user) => user.email),
    selectedRoutes: selectedRoutes.map((route) => route.label),
  });

  const userQueue = [...users];
  await runWithConcurrency(Math.min(config.concurrency, userQueue.length), async (workerIndex) => {
    while (userQueue.length > 0) {
      const user = userQueue.shift();
      if (!user) return;
      await runUserFlow({ user, workerIndex, config, env, runtime, selectedRoutes, publicKey });
    }
  });

  runtime.emit('run_finished', {
    finishedAt: new Date().toISOString(),
  });

  runtime.close();
  const summary = summarizeRun({ events: runtime.events, config, users, selectedRoutes });
  const summaryJsonPath = path.join(config.outDir, 'summary.json');
  const summaryMdPath = path.join(config.outDir, 'summary.md');
  fs.writeFileSync(summaryJsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  fs.writeFileSync(summaryMdPath, `${renderSummaryMarkdown(summary)}\n`, 'utf8');
  writeCsv(path.join(config.outDir, 'page-requests.csv'), buildPageCsvRows(runtime.events));
  writeCsv(path.join(config.outDir, 'shell-snapshots.csv'), buildShellCsvRows(runtime.events));

  console.log(`Run directory: ${relativeToRepo(config.outDir)}`);
  console.log(`Summary JSON: ${relativeToRepo(summaryJsonPath)}`);
  console.log(`Summary MD: ${relativeToRepo(summaryMdPath)}`);
}

async function runUserFlow({ user, workerIndex, config, env, runtime, selectedRoutes, publicKey }) {
  const loginStartedAt = Date.now();
  let session;
  try {
    session = await loginUser({
      user,
      supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
      supabasePublicKey: publicKey,
      pageTimeoutMs: config.pageTimeoutMs,
    });
  } catch (error) {
    runtime.emit('login', {
      workerIndex,
      userEmail: user.email,
      userName: user.name,
      ok: false,
      durationMs: Date.now() - loginStartedAt,
      error: formatError(error),
    });
    return;
  }

  let landingInfo;
  try {
    landingInfo = await resolveLanding(session, config.baseUrl, config.pageTimeoutMs);
    session.landingUrl = landingInfo.landingUrl;
    session.appOrigin = landingInfo.appOrigin;
    session.landingRedirectStatus = landingInfo.redirectStatus;
    runtime.emit('login', {
      workerIndex,
      userEmail: user.email,
      userName: user.name,
      ok: true,
      durationMs: Date.now() - loginStartedAt,
      userId: session.userId,
      tenantLandingUrl: landingInfo.landingUrl,
      appOrigin: landingInfo.appOrigin,
      landingRedirectStatus: landingInfo.redirectStatus,
    });
  } catch (error) {
    runtime.emit('login', {
      workerIndex,
      userEmail: user.email,
      userName: user.name,
      ok: false,
      durationMs: Date.now() - loginStartedAt,
      userId: session.userId,
      error: `landing_failed: ${formatError(error)}`,
    });
    return;
  }

  const routeQueue = [];
  let previousLabel = '';
  for (let stepIndex = 0; stepIndex < config.iterationsPerUser; stepIndex += 1) {
    if (routeQueue.length === 0) {
      routeQueue.push(...shuffle([...selectedRoutes], runtime.rand));
    }
    let nextRoute = routeQueue.shift();
    if (routeQueue.length > 0 && nextRoute?.label === previousLabel) {
      routeQueue.push(nextRoute);
      nextRoute = routeQueue.shift();
    }
    if (!nextRoute) break;
    previousLabel = nextRoute.label;

    const pageEvent = await requestPage({
      session,
      route: nextRoute,
      workerIndex,
      stepIndex,
      timeoutMs: config.pageTimeoutMs,
      runtime,
    });

    if (config.shellEvery > 0 && stepIndex % config.shellEvery === 0) {
      await captureShellSnapshot({
        session,
        workerIndex,
        stepIndex,
        timeoutMs: config.shellTimeoutMs,
        runtime,
        afterPageEventId: pageEvent.id,
      });
    }

    if (stepIndex + 1 < config.iterationsPerUser) {
      await sleep(randomInt(config.minThinkMs, config.maxThinkMs, runtime.rand));
    }
  }
}

async function loginUser({ user, supabaseUrl, supabasePublicKey, pageTimeoutMs }) {
  const loginRes = await fetchWithTimeout(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        ...DEFAULT_HEADERS,
        apikey: supabasePublicKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ email: user.email, password: user.password }),
    },
    pageTimeoutMs
  );
  const loginText = await loginRes.text();
  if (!loginRes.ok) {
    throw new Error(`login ${loginRes.status}: ${compactText(loginText, SNIPPET_LIMIT)}`);
  }

  const loginJson = JSON.parse(loginText);
  const jar = new Map();
  const client = createServerClient(supabaseUrl, supabasePublicKey, {
    cookies: {
      getAll() {
        return Array.from(jar, ([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) {
          if (!cookie.value) {
            jar.delete(cookie.name);
          } else {
            jar.set(cookie.name, cookie.value);
          }
        }
      },
    },
  });

  const { data, error } = await client.auth.setSession({
    access_token: loginJson.access_token,
    refresh_token: loginJson.refresh_token,
  });
  if (error) {
    throw new Error(`setSession failed: ${error.message}`);
  }

  return {
    userEmail: user.email,
    userName: user.name,
    userId: data?.user?.id ?? loginJson.user?.id ?? null,
    jar,
    appOrigin: new URL(user.loginUrl || DEFAULT_BASE_URL).origin,
    landingUrl: null,
    cookieHeader() {
      return Array.from(jar, ([name, value]) => `${name}=${value}`).join('; ');
    },
    applySetCookies(res) {
      const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
      for (const cookieLine of setCookies) {
        const firstPart = cookieLine.split(';')[0] ?? '';
        const idx = firstPart.indexOf('=');
        if (idx < 1) continue;
        const name = firstPart.slice(0, idx).trim();
        const value = firstPart.slice(idx + 1).trim();
        if (!value) {
          jar.delete(name);
        } else {
          jar.set(name, value);
        }
      }
    },
  };
}

async function resolveLanding(session, baseUrl, timeoutMs) {
  const rootUrl = new URL('/', baseUrl).href;
  const res = await fetchWithTimeout(
    rootUrl,
    {
      headers: {
        ...DEFAULT_HEADERS,
        Cookie: session.cookieHeader(),
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'manual',
    },
    timeoutMs
  );
  session.applySetCookies(res);
  const location = res.headers.get('location');
  const landingUrl = location ? new URL(location, rootUrl).href : rootUrl;
  const appOrigin = new URL(landingUrl).origin;
  await safeDisposeBody(res, false);
  return {
    landingUrl,
    appOrigin,
    redirectStatus: res.status,
  };
}

async function requestPage({ session, route, workerIndex, stepIndex, timeoutMs, runtime }) {
  const targetUrl = resolveRouteUrl(session, route.target);
  const startedAt = Date.now();
  const hops = [];
  let currentUrl = targetUrl;
  let finalStatus = 0;
  let finalUrl = targetUrl;
  let finalSnippet = null;
  let timedOut = false;
  let lastError = null;

  for (let depth = 0; depth <= runtime.config.redirectLimit; depth += 1) {
    const hopStartedAt = Date.now();
    try {
      const res = await fetchWithTimeout(
        currentUrl,
        {
          headers: {
            ...DEFAULT_HEADERS,
            Cookie: session.cookieHeader(),
            Accept: 'text/html,application/xhtml+xml',
          },
          redirect: 'manual',
        },
        timeoutMs
      );
      session.applySetCookies(res);
      const location = res.headers.get('location');
      const hop = {
        url: currentUrl,
        status: res.status,
        location: location ? new URL(location, currentUrl).href : null,
        durationMs: Date.now() - hopStartedAt,
        vercelId: res.headers.get('x-vercel-id'),
        vercelCache: res.headers.get('x-vercel-cache'),
        contentType: res.headers.get('content-type'),
      };
      hops.push(hop);
      finalStatus = res.status;
      finalUrl = currentUrl;

      if (!isRedirectStatus(res.status) || !location) {
        const shouldCaptureSnippet =
          res.status >= 400 || currentUrl.includes('/login') || currentUrl.includes('error=');
        finalSnippet = await safeDisposeBody(res, shouldCaptureSnippet);
        break;
      }

      await safeDisposeBody(res, false);
      currentUrl = hop.location;
      finalUrl = currentUrl;
    } catch (error) {
      timedOut = isTimeoutError(error);
      lastError = formatError(error);
      finalStatus = 0;
      break;
    }
  }

  const pageEvent = runtime.emit('page', {
    workerIndex,
    stepIndex,
    userEmail: session.userEmail,
    userId: session.userId,
    routeLabel: route.label,
    routeTarget: route.target,
    initialUrl: targetUrl,
    finalUrl,
    finalPath: tryPathname(finalUrl),
    finalStatus,
    timedOut,
    error: lastError,
    totalDurationMs: Date.now() - startedAt,
    redirectCount: Math.max(0, hops.length - 1),
    hops,
    finalSnippet,
    loginRedirected: Boolean(finalUrl && finalUrl.includes('/login')),
    inactiveRedirected: Boolean(finalUrl && finalUrl.includes('error=inactive')),
  });
  return pageEvent;
}

async function captureShellSnapshot({ session, workerIndex, stepIndex, timeoutMs, runtime, afterPageEventId }) {
  const shellUrl = new URL('/api/loadtest/shell-bundle', session.appOrigin).href;
  const startedAt = Date.now();
  let status = 0;
  let json = null;
  let error = null;
  let timedOut = false;
  let vercelId = null;
  let vercelCache = null;

  try {
    const res = await fetchWithTimeout(
      shellUrl,
      {
        headers: {
          ...DEFAULT_HEADERS,
          Cookie: session.cookieHeader(),
          Accept: 'application/json',
        },
        redirect: 'manual',
      },
      timeoutMs
    );
    session.applySetCookies(res);
    status = res.status;
    vercelId = res.headers.get('x-vercel-id');
    vercelCache = res.headers.get('x-vercel-cache');
    const bodyText = await res.text();
    json = safeJsonParse(bodyText);
  } catch (caught) {
    error = formatError(caught);
    timedOut = isTimeoutError(caught);
  }

  runtime.emit('shell', {
    workerIndex,
    stepIndex,
    afterPageEventId,
    userEmail: session.userEmail,
    userId: session.userId,
    url: shellUrl,
    status,
    timedOut,
    error,
    durationMs: Date.now() - startedAt,
    vercelId,
    vercelCache,
    shellResponseCacheStatus: json?.shell_response_cache_status ?? null,
    shellResponseCacheAgeMs: asNumberOrNull(json?.shell_response_cache_age_ms),
    shellCacheStatus: json?.shell_cache_status ?? null,
    shellDegraded: Boolean(json?.shell_degraded),
    shellDegradedReason: json?.shell_degraded_reason ?? null,
    shellGuardrailReasons: Array.isArray(json?.shell_guardrail_reasons) ? json.shell_guardrail_reasons : [],
    authValidationSource: json?.auth_validation_source ?? null,
    authRemoteUserCalls: asNumberOrNull(json?.auth_remote_user_calls),
    authRemoteUserFailures: asNumberOrNull(json?.auth_remote_user_failures),
    permissionCount: Array.isArray(json?.structural?.permission_keys) ? json.structural.permission_keys.length : null,
    profileRole: json?.structural?.profile_role ?? null,
    profileStatus: json?.structural?.profile_status ?? null,
    orgId: json?.structural?.org_id ?? null,
  });
}

function summarizeRun({ events, config, users, selectedRoutes }) {
  const pageEvents = events.filter((event) => event.type === 'page');
  const shellEvents = events.filter((event) => event.type === 'shell');
  const loginEvents = events.filter((event) => event.type === 'login');
  const runStarted = events.find((event) => event.type === 'run_started');
  const runFinished = events.find((event) => event.type === 'run_finished');
  const pageStatusDist = countBy(pageEvents, (event) => String(event.finalStatus || 0));
  const shellStatusDist = countBy(shellEvents, (event) => String(event.status || 0));
  const shellCacheDist = countBy(shellEvents, (event) => event.shellResponseCacheStatus || 'unknown');
  const shellModeDist = countBy(shellEvents, (event) => event.shellCacheStatus || 'unknown');
  const authValidationDist = countBy(shellEvents, (event) => event.authValidationSource || 'unknown');
  const guardrailReasonDist = countFlat(shellEvents.flatMap((event) => event.shellGuardrailReasons || []));

  const pageByRoute = {};
  for (const event of pageEvents) {
    const key = event.routeLabel;
    pageByRoute[key] ??= [];
    pageByRoute[key].push(event);
  }
  const routeStats = Object.entries(pageByRoute)
    .map(([routeLabel, routeEvents]) => {
      const durations = routeEvents.map((event) => event.totalDurationMs).sort((a, b) => a - b);
      const non200 = routeEvents.filter((event) => event.finalStatus !== 200).length;
      const slow = routeEvents.filter((event) => event.totalDurationMs >= config.slowMs).length;
      return {
        routeLabel,
        count: routeEvents.length,
        avgMs: Math.round(average(durations)),
        p95Ms: Math.round(percentile(durations, 95)),
        maxMs: Math.round(Math.max(...durations)),
        non200,
        slow,
        statusDist: countBy(routeEvents, (event) => String(event.finalStatus || 0)),
      };
    })
    .sort((a, b) => b.maxMs - a.maxMs || b.avgMs - a.avgMs);

  const shellByPage = new Map(shellEvents.filter((event) => event.afterPageEventId).map((event) => [event.afterPageEventId, event]));
  const slowPageWithDegradedShell = pageEvents.filter((page) => {
    if (page.totalDurationMs < config.slowMs) return false;
    return Boolean(shellByPage.get(page.id)?.shellDegraded);
  }).length;

  return {
    run: {
      startedAt: runStarted?.timestamp ?? null,
      finishedAt: runFinished?.timestamp ?? null,
      durationMs:
        runStarted && runFinished ? new Date(runFinished.timestamp).getTime() - new Date(runStarted.timestamp).getTime() : null,
      outDir: relativeToRepo(config.outDir),
      baseUrl: config.baseUrl,
      usersCsv: relativeToRepo(config.usersCsv),
      routeCount: selectedRoutes.length,
      selectedUsers: users.map((user) => user.email),
      selectedRoutes: selectedRoutes.map((route) => route.label),
      seed: config.seed,
    },
    logins: {
      attempts: loginEvents.length,
      ok: loginEvents.filter((event) => event.ok).length,
      failed: loginEvents.filter((event) => !event.ok).length,
      avgDurationMs: Math.round(average(loginEvents.map((event) => event.durationMs))),
    },
    pages: {
      count: pageEvents.length,
      avgDurationMs: Math.round(average(pageEvents.map((event) => event.totalDurationMs))),
      p95DurationMs: Math.round(percentile(pageEvents.map((event) => event.totalDurationMs), 95)),
      slowThresholdMs: config.slowMs,
      slowCount: pageEvents.filter((event) => event.totalDurationMs >= config.slowMs).length,
      timeoutCount: pageEvents.filter((event) => event.timedOut).length,
      loginRedirectCount: pageEvents.filter((event) => event.loginRedirected).length,
      inactiveRedirectCount: pageEvents.filter((event) => event.inactiveRedirected).length,
      statusDist: pageStatusDist,
      topSlow: pageEvents
        .slice()
        .sort((a, b) => b.totalDurationMs - a.totalDurationMs)
        .slice(0, 12)
        .map((event) => ({
          userEmail: event.userEmail,
          routeLabel: event.routeLabel,
          finalStatus: event.finalStatus,
          totalDurationMs: event.totalDurationMs,
          finalUrl: event.finalUrl,
          vercelIds: event.hops.map((hop) => hop.vercelId).filter(Boolean),
        })),
      byRoute: routeStats,
    },
    shell: {
      count: shellEvents.length,
      avgDurationMs: Math.round(average(shellEvents.map((event) => event.durationMs))),
      degradedCount: shellEvents.filter((event) => event.shellDegraded).length,
      timeoutCount: shellEvents.filter((event) => event.timedOut).length,
      statusDist: shellStatusDist,
      cacheStatusDist: shellCacheDist,
      cacheModeDist: shellModeDist,
      authValidationSourceDist: authValidationDist,
      guardrailReasonDist,
      slowPageWithDegradedShell,
      topSlow: shellEvents
        .slice()
        .sort((a, b) => b.durationMs - a.durationMs)
        .slice(0, 12)
        .map((event) => ({
          userEmail: event.userEmail,
          durationMs: event.durationMs,
          status: event.status,
          shellDegraded: event.shellDegraded,
          cacheStatus: event.shellResponseCacheStatus,
          cacheMode: event.shellCacheStatus,
          vercelId: event.vercelId,
          afterPageEventId: event.afterPageEventId,
        })),
    },
  };
}

function renderSummaryMarkdown(summary) {
  const lines = [];
  lines.push('# Production Route Thrash Summary');
  lines.push('');
  lines.push('## Run');
  lines.push(`- Started: ${summary.run.startedAt ?? 'n/a'}`);
  lines.push(`- Finished: ${summary.run.finishedAt ?? 'n/a'}`);
  lines.push(`- Duration ms: ${summary.run.durationMs ?? 'n/a'}`);
  lines.push(`- Base URL: ${summary.run.baseUrl}`);
  lines.push(`- Users CSV: ${summary.run.usersCsv}`);
  lines.push(`- Seed: ${summary.run.seed}`);
  lines.push(`- Selected users: ${summary.run.selectedUsers.join(', ')}`);
  lines.push(`- Selected routes: ${summary.run.selectedRoutes.join(', ')}`);
  lines.push('');
  lines.push('## Pages');
  lines.push(`- Count: ${summary.pages.count}`);
  lines.push(`- Avg / p95 ms: ${summary.pages.avgDurationMs} / ${summary.pages.p95DurationMs}`);
  lines.push(`- Slow >= ${summary.pages.slowThresholdMs}ms: ${summary.pages.slowCount}`);
  lines.push(`- Timeouts: ${summary.pages.timeoutCount}`);
  lines.push(`- Login redirects: ${summary.pages.loginRedirectCount}`);
  lines.push(`- Status dist: ${renderDist(summary.pages.statusDist)}`);
  lines.push('');
  lines.push('### Slowest page requests');
  for (const item of summary.pages.topSlow) {
    lines.push(
      `- ${item.userEmail} ${item.routeLabel} -> ${item.finalStatus} in ${item.totalDurationMs}ms (${item.finalUrl}) [${item.vercelIds.join(', ')}]`
    );
  }
  lines.push('');
  lines.push('### Route aggregates');
  for (const route of summary.pages.byRoute) {
    lines.push(
      `- ${route.routeLabel}: count=${route.count} avg=${route.avgMs}ms p95=${route.p95Ms}ms max=${route.maxMs}ms slow=${route.slow} non200=${route.non200} status=${renderDist(route.statusDist)}`
    );
  }
  lines.push('');
  lines.push('## Shell');
  lines.push(`- Count: ${summary.shell.count}`);
  lines.push(`- Avg ms: ${summary.shell.avgDurationMs}`);
  lines.push(`- Degraded: ${summary.shell.degradedCount}`);
  lines.push(`- Timeouts: ${summary.shell.timeoutCount}`);
  lines.push(`- Slow page + degraded shell pairings: ${summary.shell.slowPageWithDegradedShell}`);
  lines.push(`- Status dist: ${renderDist(summary.shell.statusDist)}`);
  lines.push(`- Cache status dist: ${renderDist(summary.shell.cacheStatusDist)}`);
  lines.push(`- Cache mode dist: ${renderDist(summary.shell.cacheModeDist)}`);
  lines.push(`- Auth validation dist: ${renderDist(summary.shell.authValidationSourceDist)}`);
  lines.push(`- Guardrail reasons: ${renderDist(summary.shell.guardrailReasonDist)}`);
  lines.push('');
  lines.push('### Slowest shell snapshots');
  for (const item of summary.shell.topSlow) {
    lines.push(
      `- ${item.userEmail} shell ${item.status} in ${item.durationMs}ms degraded=${String(item.shellDegraded)} cache=${item.cacheStatus}/${item.cacheMode} vercel=${item.vercelId ?? 'n/a'}`
    );
  }
  return lines.join('\n');
}

function buildPageCsvRows(events) {
  return events
    .filter((event) => event.type === 'page')
    .map((event) => ({
      timestamp: event.timestamp,
      userEmail: event.userEmail,
      userId: event.userId,
      routeLabel: event.routeLabel,
      routeTarget: event.routeTarget,
      finalStatus: String(event.finalStatus),
      totalDurationMs: String(event.totalDurationMs),
      redirectCount: String(event.redirectCount),
      timedOut: String(event.timedOut),
      loginRedirected: String(event.loginRedirected),
      inactiveRedirected: String(event.inactiveRedirected),
      finalUrl: event.finalUrl,
      vercelIds: event.hops.map((hop) => hop.vercelId).filter(Boolean).join('|'),
      error: event.error ?? '',
    }));
}

function buildShellCsvRows(events) {
  return events
    .filter((event) => event.type === 'shell')
    .map((event) => ({
      timestamp: event.timestamp,
      userEmail: event.userEmail,
      userId: event.userId,
      status: String(event.status),
      durationMs: String(event.durationMs),
      timedOut: String(event.timedOut),
      shellDegraded: String(event.shellDegraded),
      shellDegradedReason: event.shellDegradedReason ?? '',
      shellResponseCacheStatus: event.shellResponseCacheStatus ?? '',
      shellCacheStatus: event.shellCacheStatus ?? '',
      permissionCount: event.permissionCount == null ? '' : String(event.permissionCount),
      profileRole: event.profileRole ?? '',
      profileStatus: event.profileStatus ?? '',
      authValidationSource: event.authValidationSource ?? '',
      vercelId: event.vercelId ?? '',
      guardrailReasons: (event.shellGuardrailReasons ?? []).join('|'),
      error: event.error ?? '',
    }));
}

function createRuntime(config) {
  const startedAt = new Date();
  const runId = `prod-route-thrash-${formatStamp(startedAt)}`;
  const outDir = config.outDir;
  ensureDir(outDir);
  const eventsPath = path.join(outDir, 'events.jsonl');
  const stream = fs.createWriteStream(eventsPath, { flags: 'a' });
  const events = [];
  let nextId = 0;
  const rand = mulberry32(config.seed);

  return {
    config: { ...config, outDir, runId },
    rand,
    events,
    emit(type, payload) {
      const event = {
        id: `${type}_${String(++nextId).padStart(5, '0')}`,
        type,
        timestamp: new Date().toISOString(),
        runId,
        ...payload,
      };
      events.push(event);
      stream.write(`${JSON.stringify(event)}\n`);
      printProgress(event);
      return event;
    },
    close() {
      stream.end();
    },
  };
}

function buildConfig(args) {
  const now = new Date();
  const stamp = formatStamp(now);
  const outDir = path.join(reportsRoot, `prod-route-thrash-${stamp}`);
  const emails = String(args.emails ?? '');
  const explicitEmailCount = emails
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean).length;
  const defaultMaxUsers = explicitEmailCount > 0 ? explicitEmailCount : 1;
  return {
    baseUrl: String(args.baseUrl ?? DEFAULT_BASE_URL),
    usersCsv: path.resolve(repoRoot, String(args.usersCsv ?? DEFAULT_USERS_CSV)),
    routesFile: args.routesFile ? path.resolve(repoRoot, String(args.routesFile)) : '',
    outDir,
    maxUsers: Number.parseInt(String(args.maxUsers ?? String(defaultMaxUsers)), 10),
    concurrency: Number.parseInt(String(args.concurrency ?? '1'), 10),
    iterationsPerUser: Number.parseInt(String(args.iterationsPerUser ?? '16'), 10),
    pageTimeoutMs: Number.parseInt(String(args.pageTimeoutMs ?? '12000'), 10),
    shellTimeoutMs: Number.parseInt(String(args.shellTimeoutMs ?? '8000'), 10),
    minThinkMs: Number.parseInt(String(args.minThinkMs ?? '100'), 10),
    maxThinkMs: Number.parseInt(String(args.maxThinkMs ?? '450'), 10),
    slowMs: Number.parseInt(String(args.slowMs ?? '1200'), 10),
    shellEvery: Number.parseInt(String(args.shellEvery ?? '1'), 10),
    seed: Number.parseInt(String(args.seed ?? `${Math.floor(now.getTime() % 2147483647)}`), 10),
    redirectLimit: Number.parseInt(String(args.redirectLimit ?? '5'), 10),
    emails,
    emailPattern: String(args.emailPattern ?? ''),
  };
}

function loadRoutePool(routesFile) {
  if (!routesFile) return DEFAULT_ROUTE_POOL;
  const raw = fs.readFileSync(routesFile, 'utf8').trim();
  if (!raw) return DEFAULT_ROUTE_POOL;
  if (routesFile.endsWith('.json')) {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error('routesFile JSON must be an array of strings or { label, target } objects.');
    }
    return parsed.map(normalizeRouteSpec);
  }
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => normalizeRouteSpec(line));
}

function normalizeRouteSpec(value) {
  if (typeof value === 'string') {
    return { label: slugifyLabel(value), target: value };
  }
  if (value && typeof value === 'object' && typeof value.target === 'string') {
    return { label: typeof value.label === 'string' && value.label ? value.label : slugifyLabel(value.target), target: value.target };
  }
  throw new Error(`Invalid route spec: ${JSON.stringify(value)}`);
}

function resolveRouteUrl(session, target) {
  if (target === '$tenantDashboard') {
    return session.landingUrl || new URL('/dashboard', session.appOrigin).href;
  }
  if (/^https?:\/\//i.test(target)) return target;
  return new URL(target, session.appOrigin).href;
}

function loadUsersCsv(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
  if (raw.length < 2) {
    throw new Error(`Users CSV has no data rows: ${filePath}`);
  }
  const header = parseCsvLine(raw[0]).map((cell) => cell.trim().toLowerCase());
  const nameIdx = header.indexOf('name');
  const urlIdx = header.indexOf('url');
  const usernameIdx = header.indexOf('username');
  const passwordIdx = header.indexOf('password');
  const noteIdx = header.indexOf('note');

  if (usernameIdx < 0 || passwordIdx < 0) {
    throw new Error('Users CSV must include username and password columns.');
  }

  return raw
    .slice(1)
    .map((line) => parseCsvLine(line))
    .map((cols) => ({
      name: (cols[nameIdx] ?? '').trim(),
      loginUrl: (cols[urlIdx] ?? `${DEFAULT_BASE_URL}/login`).trim(),
      email: (cols[usernameIdx] ?? '').trim().toLowerCase(),
      password: (cols[passwordIdx] ?? '').trim(),
      note: (cols[noteIdx] ?? '').trim(),
    }))
    .filter((row) => row.email && row.password && row.loginUrl);
}

function selectUsers(users, config, rand) {
  let filtered = [...users];
  const explicitEmails = config.emails
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (explicitEmails.length > 0) {
    const wanted = new Set(explicitEmails);
    filtered = filtered.filter((user) => wanted.has(user.email));
  }
  if (config.emailPattern) {
    const pattern = config.emailPattern.toLowerCase();
    filtered = filtered.filter((user) => user.email.includes(pattern));
  }
  return filtered.slice(0, Math.max(1, config.maxUsers));
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      out[key] = 'true';
      continue;
    }
    out[key] = next;
    index += 1;
  }
  return out;
}

function printHelp() {
  console.log(`Usage: node scripts/prod-route-thrash.mjs [options]

Runs a production-safe signed-in route thrash against CampSite using real Supabase
session cookies, then writes one incident folder with JSONL, CSV, JSON, and MD summaries.

Options:
  --baseUrl <url>             Default: ${DEFAULT_BASE_URL}
  --usersCsv <path>           Default: scripts/ussu-provision-output/ussu-password-import.csv
  --routesFile <path>         Optional .json or newline-delimited route list
  --emails <csv>              Exact emails, comma separated
  --emailPattern <text>       Substring filter for emails
  --maxUsers <n>              Default: 1
  --concurrency <n>           Default: 1
  --iterationsPerUser <n>     Default: 16
  --pageTimeoutMs <n>         Default: 12000
  --shellTimeoutMs <n>        Default: 8000
  --minThinkMs <n>            Default: 100
  --maxThinkMs <n>            Default: 450
  --slowMs <n>                Default: 1200
  --shellEvery <n>            Default: 1
  --seed <n>                  Default: current timestamp-derived value
  --redirectLimit <n>         Default: 5

Examples:
  npm run probe:prod:routes -- --emails james.hann@camp-site.co.uk
  npm run probe:prod:routes -- --maxUsers 6 --concurrency 3 --iterationsPerUser 12
  npm run probe:prod:routes -- --emails james.hann@camp-site.co.uk --routesFile scripts/prod-routes.txt
`);
}

function loadEnv(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    env[key] = value;
  }
  return env;
}

function getSupabasePublicKey(env) {
  return (
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    ''
  );
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function relativeToRepo(filePath) {
  return path.relative(repoRoot, filePath).replaceAll(path.sep, '/');
}

function parseCsvLine(line) {
  const out = [];
  let current = '';
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = index + 1 < line.length ? line[index + 1] : '';
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      out.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  out.push(current);
  return out;
}

function shuffle(items, rand) {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const other = Math.floor(rand() * (index + 1));
    [out[index], out[other]] = [out[other], out[index]];
  }
  return out;
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return function next() {
    value += 0x6d2b79f5;
    let x = value;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(min, max, rand) {
  if (max <= min) return min;
  return min + Math.floor(rand() * (max - min + 1));
}

function formatStamp(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
  });
}

function isRedirectStatus(status) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

async function safeDisposeBody(res, captureSnippet) {
  try {
    if (captureSnippet) {
      const text = await res.text();
      return compactText(text, SNIPPET_LIMIT);
    }
    if (res.body && typeof res.body.cancel === 'function') {
      await res.body.cancel();
    }
  } catch {
    return null;
  }
  return null;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function compactText(text, limit) {
  return String(text).replace(/\s+/g, ' ').trim().slice(0, limit);
}

function tryPathname(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}

function asNumberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function countBy(items, keyFn) {
  const out = {};
  for (const item of items) {
    const key = keyFn(item);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

function countFlat(values) {
  const out = {};
  for (const value of values) {
    const key = String(value || 'unknown');
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

function renderDist(dist) {
  const entries = Object.entries(dist);
  if (!entries.length) return 'none';
  return entries
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, value]) => `${key}:${value}`)
    .join(', ');
}

function slugifyLabel(value) {
  return String(value)
    .replace(/https?:\/\//gi, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

async function runWithConcurrency(count, worker) {
  const workers = [];
  for (let index = 0; index < count; index += 1) {
    workers.push(worker(index + 1));
  }
  await Promise.all(workers);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTimeoutError(error) {
  const text = formatError(error).toLowerCase();
  return text.includes('timeout') || text.includes('aborted');
}

function formatError(error) {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

function printProgress(event) {
  if (event.type === 'login') {
    const status = event.ok ? 'ok' : 'fail';
    console.log(`login ${status} user=${event.userEmail} ms=${event.durationMs} appOrigin=${event.appOrigin ?? 'n/a'}`);
    return;
  }
  if (event.type === 'page') {
    console.log(
      `page user=${event.userEmail} route=${event.routeLabel} status=${event.finalStatus} ms=${event.totalDurationMs} url=${event.finalPath || event.finalUrl}`
    );
    return;
  }
  if (event.type === 'shell') {
    console.log(
      `shell user=${event.userEmail} status=${event.status} ms=${event.durationMs} degraded=${String(event.shellDegraded)} cache=${event.shellResponseCacheStatus ?? 'unknown'}`
    );
  }
}

function writeCsv(filePath, rows) {
  if (!rows.length) {
    fs.writeFileSync(filePath, '\n', 'utf8');
    return;
  }
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((header) => `"${String(row[header] ?? '').replace(/"/g, '""')}"`)
        .join(',')
    ),
  ];
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}
