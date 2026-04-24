import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { Counter, Rate } from 'k6/metrics';

const APP_BASE_URL = __ENV.APP_BASE_URL;
const USERS_CSV_PATH = __ENV.K6_USERS_CSV ?? 'reports/incident/k6-token-static-users.csv';
const USERS_CSV_ENV_FILTER = (__ENV.K6_USERS_CSV_ENV ?? '').trim().toLowerCase();
const SCENARIO_DURATION = __ENV.K6_SCENARIO_DURATION ?? '5m';
const THINK_MIN_MS = Number.parseInt(__ENV.K6_THINK_MIN_MS ?? '200', 10);
const THINK_MAX_MS = Number.parseInt(__ENV.K6_THINK_MAX_MS ?? '900', 10);
const PREAUTH_ALL = (__ENV.K6_PREAUTH_ALL ?? '1') !== '0';
const SETUP_TIMEOUT = __ENV.K6_SETUP_TIMEOUT ?? '10m';
const PREAUTH_REQUIRED_RATIO = Number.parseFloat(__ENV.K6_PREAUTH_REQUIRED_RATIO ?? '1');
const HTTP_TIMEOUT = __ENV.K6_HTTP_TIMEOUT ?? '20s';
const SUMMARY_EXPORT_PATH = __ENV.K6_SAFE_SUMMARY_EXPORT ?? '';

const USERS_CSV_RAW = readUsersCsvRaw();
const appTimeouts = new Counter('app_timeouts');
const appTimeoutRate = new Rate('app_timeout_rate');
const appNon200Rate = new Rate('app_non_200_rate');
const authTokenRequestsDuringTest = new Counter('auth_token_requests_during_test');
const missingAuthorizationHeader = new Counter('missing_authorization_header');
const tokenExpiringDuringRun = new Counter('token_expiring_during_run');
const shellCacheHitRate = new Rate('shell_cache_hit_rate');
const shellCacheMissRate = new Rate('shell_cache_miss_rate');
const shellCacheCoalescedRate = new Rate('shell_cache_coalesced_rate');
const shellCacheUnknownRate = new Rate('shell_cache_unknown_rate');

if (!APP_BASE_URL || !USERS_CSV_PATH) {
  throw new Error(
    'Missing env vars: set APP_BASE_URL and K6_USERS_CSV (token-static CSV with access_token).'
  );
}

const thresholds = {
  http_req_failed: ['rate<0.01'],
  http_req_duration: ['p(95)<900', 'p(99)<1800'],
  app_timeout_rate: ['rate<0.2'],
  app_non_200_rate: ['rate<0.3'],
  auth_token_requests_during_test: ['count==0'],
  'http_req_duration{endpoint:app_shell_bundle}': ['p(95)<900', 'p(99)<1700'],
};

export const options = {
  setupTimeout: SETUP_TIMEOUT,
  thresholds,
  scenarios: {
    normal_multitenant: {
      executor: 'constant-vus',
      vus: Number.parseInt(__ENV.K6_NORMAL_VUS ?? '80', 10),
      duration: SCENARIO_DURATION,
      gracefulStop: '30s',
      exec: 'runNormalScenario',
    },
    burst_window: {
      executor: 'ramping-vus',
      startTime: '30s',
      stages: [
        { duration: '30s', target: Number.parseInt(__ENV.K6_BURST_VUS ?? '180', 10) },
        { duration: '90s', target: Number.parseInt(__ENV.K6_BURST_VUS ?? '180', 10) },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '20s',
      exec: 'runBurstScenario',
    },
    noisy_neighbor: {
      executor: 'constant-vus',
      vus: Number.parseInt(__ENV.K6_NOISY_VUS ?? '30', 10),
      duration: SCENARIO_DURATION,
      gracefulStop: '20s',
      exec: 'runNoisyNeighborScenario',
    },
  },
};

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = i + 1 < line.length ? line[i + 1] : '';
    if (ch === '"') {
      if (inQuotes && next === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function readUsersCsvRaw() {
  try {
    return open(USERS_CSV_PATH);
  } catch (firstErr) {
    if (!USERS_CSV_PATH.startsWith('/')) {
      try {
        return open(`../${USERS_CSV_PATH}`);
      } catch {
        throw firstErr;
      }
    }
    throw firstErr;
  }
}

function loadUsersFromCsv(raw) {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) throw new Error('K6 users CSV has no rows');

  const header = parseCsvLine(lines[0]).map((x) => x.trim().toLowerCase());
  const usernameIdx = header.indexOf('username');
  const envIdx = header.indexOf('environment');
  const orgSlugIdx = header.indexOf('org_slug');
  const accessTokenIdx = header.indexOf('access_token');
  const urlIdx = header.indexOf('url');

  if (usernameIdx < 0 || accessTokenIdx < 0) {
    throw new Error('K6 users CSV must include username,access_token headers');
  }

  const users = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const email = (cols[usernameIdx] ?? '').trim();
    const envFromCol = envIdx >= 0 ? (cols[envIdx] ?? '').trim().toLowerCase() : '';
    const url = urlIdx >= 0 ? (cols[urlIdx] ?? '').trim().toLowerCase() : '';
    const envFromUrl = url.includes('localhost') ? 'local' : url.includes('camp-site.co.uk') ? 'production' : '';
    const env = envFromCol || envFromUrl;
    const orgSlug = orgSlugIdx >= 0 ? (cols[orgSlugIdx] ?? '').trim() : '';
    if (!email) continue;
    if (USERS_CSV_ENV_FILTER && env && env !== USERS_CSV_ENV_FILTER) continue;
    const accessToken = accessTokenIdx >= 0 ? (cols[accessTokenIdx] ?? '').trim() : '';
    users.push({ email, env, orgSlug, accessToken });
  }

  if (users.length < 10) {
    throw new Error('Need at least 10 users in K6 CSV for app-path multitenant test');
  }
  return users;
}

function randomThinkSec() {
  const ms = THINK_MIN_MS + Math.random() * (THINK_MAX_MS - THINK_MIN_MS);
  return ms / 1000;
}

function appHeaders(token) {
  if (!token) {
    missingAuthorizationHeader.add(1);
    return { Accept: 'application/json' };
  }
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
}

function parseJwtExp(token) {
  const parts = String(token).split('.');
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(encoding.b64decode(parts[1], 'rawurl', 's'));
    if (!payload || typeof payload.exp !== 'number') return null;
    return payload.exp;
  } catch {
    return null;
  }
}

function recordOutcome(res) {
  const timedOut = String(res.error || '').toLowerCase().includes('timeout');
  if (timedOut) appTimeouts.add(1);
  appTimeoutRate.add(timedOut);
  appNon200Rate.add(res.status !== 200);

  let status = 'unknown';
  try {
    const body = res.json();
    const raw = body && typeof body === 'object' ? body.shell_response_cache_status : null;
    if (typeof raw === 'string') status = raw;
  } catch {
    status = 'unknown';
  }
  shellCacheHitRate.add(status === 'hit');
  shellCacheMissRate.add(status === 'miss');
  shellCacheCoalescedRate.add(status === 'coalesced');
  shellCacheUnknownRate.add(status === 'unknown');
}

function callAppShellBundle(token) {
  const scenario = exec.scenario.name || 'unknown';
  const res = http.get(`${APP_BASE_URL}/api/loadtest/shell-bundle`, {
    headers: appHeaders(token),
    timeout: HTTP_TIMEOUT,
    tags: { endpoint: 'app_shell_bundle', scenario },
  });
  check(res, { 'app shell bundle status is 200': (r) => r.status === 200 });
  recordOutcome(res);
  return res;
}

function weightedNormalFlow(token) {
  callAppShellBundle(token);
}

function burstFlow(token) {
  callAppShellBundle(token);
}

function noisyNeighborFlow(token) {
  callAppShellBundle(token);
}

function getVuUser(users, group) {
  if (group === 'noisy') {
    const noisyOrg = users.filter((u) => u.orgSlug && u.orgSlug === users[0].orgSlug);
    const scope = noisyOrg.length > 0 ? noisyOrg : users.slice(0, Math.max(5, Math.floor(users.length * 0.15)));
    return scope[(__VU - 1) % scope.length];
  }
  return users[(__VU - 1) % users.length];
}

function getToken(authUsers, group) {
  if (!authUsers.length) {
    throw new Error('No token-static users available');
  }
  const user = getVuUser(authUsers, group);
  if (!user.token) {
    throw new Error(`Missing access_token for ${user.email}`);
  }
  return user.token;
}

export function setup() {
  const users = loadUsersFromCsv(USERS_CSV_RAW);
  const preauthCount = PREAUTH_ALL
    ? users.length
    : Math.min(Number.parseInt(__ENV.K6_PREAUTH_COUNT ?? '30', 10), users.length);
  const authUsers = [];

  const durationSeconds = Number.parseInt((SCENARIO_DURATION || '5m').replace('m', ''), 10) * 60;
  const minRequiredExp = Math.floor(Date.now() / 1000) + durationSeconds + 180;

  for (let i = 0; i < preauthCount; i += 1) {
    const user = users[i];
    if (!user.accessToken) {
      throw new Error(
        `Missing access_token in K6 CSV for user ${user.email}. Token-static app-path mode requires it.`
      );
    }
    const token = user.accessToken;
    const exp = parseJwtExp(token);
    if (exp !== null && exp <= minRequiredExp) {
      tokenExpiringDuringRun.add(1);
      throw new Error(
        `Token for ${user.email} expires before run window closes (exp=${exp}, min_required=${minRequiredExp}).`
      );
    }
    authUsers.push({ ...user, token });
  }

  const required = Math.ceil(preauthCount * PREAUTH_REQUIRED_RATIO);
  if (authUsers.length < required) {
    throw new Error(
      `Insufficient token users: ${authUsers.length}/${preauthCount}. Required at least ${required}.`
    );
  }

  console.log(`app-path token-static setup complete: ${authUsers.length}/${preauthCount} users ready`);
  return { authUsers };
}

export function runNormalScenario(data) {
  authTokenRequestsDuringTest.add(0);
  const token = getToken(data.authUsers, 'normal');
  weightedNormalFlow(token);
  sleep(randomThinkSec());
}

export function runBurstScenario(data) {
  authTokenRequestsDuringTest.add(0);
  const token = getToken(data.authUsers, 'normal');
  burstFlow(token);
  sleep(0.1 + Math.random() * 0.2);
}

export function runNoisyNeighborScenario(data) {
  authTokenRequestsDuringTest.add(0);
  const token = getToken(data.authUsers, 'noisy');
  noisyNeighborFlow(token);
  sleep(0.15 + Math.random() * 0.25);
}

export default function (data) {
  const scenarioName = exec.scenario.name || '';
  if (scenarioName === 'burst_window') return runBurstScenario(data);
  if (scenarioName === 'noisy_neighbor') return runNoisyNeighborScenario(data);
  return runNormalScenario(data);
}

export function handleSummary(data) {
  if (!SUMMARY_EXPORT_PATH) return {};
  const safe = JSON.parse(JSON.stringify(data));
  if (safe && typeof safe === 'object' && 'setup_data' in safe) {
    delete safe.setup_data;
  }
  return {
    [SUMMARY_EXPORT_PATH]: JSON.stringify(safe, null, 2),
  };
}
