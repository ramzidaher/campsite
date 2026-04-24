import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { Counter, Rate } from 'k6/metrics';

const SUPABASE_URL = __ENV.SUPABASE_URL || __ENV.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  __ENV.SUPABASE_ANON_KEY ||
  __ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  __ENV.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  __ENV.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
const USERS_CSV_PATH = __ENV.K6_USERS_CSV ?? 'scripts/ussu-provision-output/ussu-password-import.csv';
const USERS_CSV_ENV_FILTER = (__ENV.K6_USERS_CSV_ENV ?? '').trim().toLowerCase();
const SCENARIO_DURATION = __ENV.K6_SCENARIO_DURATION ?? '5m';
const THINK_MIN_MS = Number.parseInt(__ENV.K6_THINK_MIN_MS ?? '200', 10);
const THINK_MAX_MS = Number.parseInt(__ENV.K6_THINK_MAX_MS ?? '900', 10);
const AUTH_RETRIES = Number.parseInt(__ENV.K6_AUTH_RETRIES ?? '4', 10);
const AUTH_RETRY_BASE_MS = Number.parseInt(__ENV.K6_AUTH_RETRY_BASE_MS ?? '250', 10);
const PREAUTH_ALL = (__ENV.K6_PREAUTH_ALL ?? '1') !== '0';
const SETUP_TIMEOUT = __ENV.K6_SETUP_TIMEOUT ?? '10m';
const PREAUTH_REQUIRED_RATIO = Number.parseFloat(__ENV.K6_PREAUTH_REQUIRED_RATIO ?? '1');
const RPC_TIMEOUT = __ENV.K6_RPC_TIMEOUT ?? '20s';
const SUMMARY_EXPORT_PATH = __ENV.K6_SAFE_SUMMARY_EXPORT ?? '';
/** When "1", layout-style load uses two parallel PostgREST RPCs like Next.js cached shell bundle. */
const USE_PARALLEL_SHELL = (__ENV.K6_USE_PARALLEL_SHELL ?? '1').trim() !== '0';
const USERS_CSV_RAW = readUsersCsvRaw();
const rpcTimeouts = new Counter('rpc_timeouts');
const rpcTimeoutRate = new Rate('rpc_timeout_rate');
const rpcNon200Rate = new Rate('rpc_non_200_rate');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !USERS_CSV_PATH) {
  throw new Error(
    'Missing env vars: set SUPABASE_URL/SUPABASE_ANON_KEY (or NEXT_PUBLIC equivalents). ' +
      'Also supports NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY. ' +
      'K6_USERS_CSV defaults to scripts/qa-login-import.csv.'
  );
}

const authHeaders = {
  apikey: SUPABASE_ANON_KEY,
  'Content-Type': 'application/json',
};

const thresholds = {
  http_req_failed: ['rate<0.01'],
  http_req_duration: ['p(95)<900', 'p(99)<1800'],
  rpc_timeout_rate: ['rate<0.2'],
  rpc_non_200_rate: ['rate<0.3'],
  'http_req_duration{endpoint:rpc_badges}': ['p(95)<700', 'p(99)<1400'],
  'http_req_duration{endpoint:rpc_layout}': ['p(95)<900', 'p(99)<1700'],
  'http_req_duration{endpoint:rpc_structural}': ['p(95)<900', 'p(99)<1700'],
  'http_req_duration{endpoint:rpc_scheduling}': ['p(95)<1100', 'p(99)<2200'],
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
    // k6 resolves open() paths relative to this script, so retry one level up for repo-root style paths.
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
  const passwordIdx = header.indexOf('password');
  const envIdx = header.indexOf('environment');
  const orgSlugIdx = header.indexOf('org_slug');
  const accessTokenIdx = header.indexOf('access_token');
  const urlIdx = header.indexOf('url');

  if (usernameIdx < 0 || passwordIdx < 0) {
    throw new Error('K6 users CSV must include username,password headers');
  }

  const users = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const email = (cols[usernameIdx] ?? '').trim();
    const password = (cols[passwordIdx] ?? '').trim();
    const envFromCol = envIdx >= 0 ? (cols[envIdx] ?? '').trim().toLowerCase() : '';
    const url = urlIdx >= 0 ? (cols[urlIdx] ?? '').trim().toLowerCase() : '';
    const envFromUrl = url.includes('localhost') ? 'local' : url.includes('camp-site.co.uk') ? 'production' : '';
    const env = envFromCol || envFromUrl;
    const orgSlug = orgSlugIdx >= 0 ? (cols[orgSlugIdx] ?? '').trim() : '';
    if (!email || !password) continue;
    if (USERS_CSV_ENV_FILTER && env && env !== USERS_CSV_ENV_FILTER) continue;
    const accessToken = accessTokenIdx >= 0 ? (cols[accessTokenIdx] ?? '').trim() : '';
    users.push({ email, password, env, orgSlug, accessToken });
  }

  if (users.length < 10) {
    throw new Error('Need at least 10 users in K6 CSV for multitenant reliability test');
  }
  return users;
}

function login(email, password) {
  let lastStatus = 0;
  let lastBody = '';

  for (let attempt = 1; attempt <= AUTH_RETRIES + 1; attempt += 1) {
    const res = http.post(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      JSON.stringify({ email, password }),
      { headers: authHeaders, tags: { endpoint: 'auth_login' } }
    );
    lastStatus = res.status;
    lastBody = String(res.body ?? '');
    if (res.status === 200) {
      const token = res.json('access_token');
      if (token) return token;
    }

    // 429 / 5xx are usually transient under burst auth load.
    if (res.status === 429 || res.status >= 500) {
      const backoffMs = AUTH_RETRY_BASE_MS * Math.pow(2, attempt - 1);
      sleep((backoffMs + Math.random() * AUTH_RETRY_BASE_MS) / 1000);
      continue;
    }
    break;
  }

  throw new Error(`Login failed (${email}) status=${lastStatus} body=${lastBody.slice(0, 160)}`);
}

function randomThinkSec() {
  const ms = THINK_MIN_MS + Math.random() * (THINK_MAX_MS - THINK_MIN_MS);
  return ms / 1000;
}

function shellRpcHeaders(token) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function recordRpcOutcome(res) {
  const timedOut = String(res.error || '').toLowerCase().includes('timeout');
  if (timedOut) rpcTimeouts.add(1);
  rpcTimeoutRate.add(timedOut);
  rpcNon200Rate.add(res.status !== 200);
}

function callRpc(token, rpcName, endpointTag) {
  const res = http.post(
    `${SUPABASE_URL}/rest/v1/rpc/${rpcName}`,
    '{}',
    {
      headers: shellRpcHeaders(token),
      timeout: RPC_TIMEOUT,
      tags: { endpoint: endpointTag, scenario: exec.scenario.name || 'unknown' },
    }
  );
  check(res, {
    [`${rpcName} status is 200`]: (r) => r.status === 200,
  });
  recordRpcOutcome(res);
  return res;
}

/** Matches apps/web cached shell: structural || badge in one logical step (parallel HTTP). */
function callShellLayoutLikeProd(token) {
  const scenario = exec.scenario.name || 'unknown';
  if (!USE_PARALLEL_SHELL) {
    return callRpc(token, 'main_shell_layout_bundle', 'rpc_layout');
  }
  const params = {
    headers: shellRpcHeaders(token),
    timeout: RPC_TIMEOUT,
  };
  const responses = http.batch([
    ['POST', `${SUPABASE_URL}/rest/v1/rpc/main_shell_layout_structural`, '{}', { ...params, tags: { endpoint: 'rpc_structural', scenario } }],
    ['POST', `${SUPABASE_URL}/rest/v1/rpc/main_shell_badge_counts_bundle`, '{}', { ...params, tags: { endpoint: 'rpc_badges', scenario } }],
  ]);
  for (const res of responses) {
    check(res, { 'parallel shell rpc status is 200': (r) => r.status === 200 });
    recordRpcOutcome(res);
  }
  return responses;
}

function weightedNormalFlow(token) {
  const r = Math.random();
  if (r < 0.7) {
    callRpc(token, 'main_shell_badge_counts_bundle', 'rpc_badges');
  } else {
    callShellLayoutLikeProd(token);
  }
}

function burstFlow(token) {
  callRpc(token, 'main_shell_badge_counts_bundle', 'rpc_badges');
  if (Math.random() < 0.5) {
    callShellLayoutLikeProd(token);
  }
}

function noisyNeighborFlow(token) {
  // Keep noisy traffic concentrated on the shell hot path under test.
  callRpc(token, 'main_shell_badge_counts_bundle', 'rpc_badges');
  if (Math.random() < 0.4) {
    callShellLayoutLikeProd(token);
  }
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
    throw new Error('No pre-authenticated users available');
  }
  const user = getVuUser(authUsers, group);
  if (!user.token) {
    throw new Error(`Missing pre-auth token for ${user.email}`);
  }
  return user.token;
}

export function setup() {
  const users = loadUsersFromCsv(USERS_CSV_RAW);
  const preauthCount = PREAUTH_ALL
    ? users.length
    : Math.min(Number.parseInt(__ENV.K6_PREAUTH_COUNT ?? '30', 10), users.length);
  const authUsers = [];

  for (let i = 0; i < preauthCount; i += 1) {
    const user = users[i];
    if (user.accessToken) {
      authUsers.push({
        ...user,
        token: user.accessToken,
      });
      continue;
    }
    try {
      const token = login(user.email, user.password);
      authUsers.push({
        ...user,
        token,
      });
    } catch (error) {
      console.error(`preauth failed for ${user.email}: ${String(error)}`);
    }
    // Keep setup fast enough to complete before setup timeout while still smoothing auth bursts.
    sleep(0.03 + Math.random() * 0.05);
  }

  const required = Math.ceil(preauthCount * PREAUTH_REQUIRED_RATIO);
  if (authUsers.length < required) {
    throw new Error(
      `Insufficient pre-auth users: ${authUsers.length}/${preauthCount}. ` +
        `Required at least ${required}.`
    );
  }

  const tokenColumnCount = authUsers.filter((u) => Boolean(u.accessToken)).length;
  console.log(
    `preauth complete: ${authUsers.length}/${preauthCount} users ready; ` +
      `token-column users=${tokenColumnCount}`
  );
  return { authUsers };
}

export function runNormalScenario(data) {
  const token = getToken(data.authUsers, 'normal');
  weightedNormalFlow(token);
  sleep(randomThinkSec());
}

export function runBurstScenario(data) {
  const token = getToken(data.authUsers, 'normal');
  burstFlow(token);
  sleep(0.1 + Math.random() * 0.2);
}

export function runNoisyNeighborScenario(data) {
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
  if (!SUMMARY_EXPORT_PATH) {
    return {};
  }

  const safe = JSON.parse(JSON.stringify(data));
  if (safe && typeof safe === 'object' && 'setup_data' in safe) {
    delete safe.setup_data;
  }

  return {
    [SUMMARY_EXPORT_PATH]: JSON.stringify(safe, null, 2),
  };
}
