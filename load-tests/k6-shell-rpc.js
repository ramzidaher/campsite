import http from 'k6/http';
import { check, sleep } from 'k6';

const SUPABASE_URL = __ENV.SUPABASE_URL;
const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY;
const TEST_EMAIL = __ENV.K6_TEST_EMAIL;
const TEST_PASSWORD = __ENV.K6_TEST_PASSWORD;
const USERS_CSV_PATH = __ENV.K6_USERS_CSV ?? '';
const USERS_CSV_ENV_FILTER = (__ENV.K6_USERS_CSV_ENV ?? '').trim().toLowerCase();
const PREAUTH_COUNT = Number.parseInt(__ENV.K6_PREAUTH_COUNT ?? '0', 10);
const PREAUTH_DELAY_MS = Number.parseInt(__ENV.K6_PREAUTH_DELAY_MS ?? '150', 10);
const SHARED_TOKEN = __ENV.K6_SHARED_TOKEN ?? '';

const BADGE_RPC_WEIGHT = Number.parseFloat(__ENV.K6_BADGE_WEIGHT ?? '0.85');
const PAUSE_MIN_MS = Number.parseInt(__ENV.K6_PAUSE_MIN_MS ?? '200', 10);
const PAUSE_MAX_MS = Number.parseInt(__ENV.K6_PAUSE_MAX_MS ?? '800', 10);

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || (!SHARED_TOKEN && !TEST_EMAIL && !USERS_CSV_PATH)) {
  if (!USERS_CSV_PATH && !SHARED_TOKEN) {
    throw new Error(
      'Missing required env vars: either set K6_USERS_CSV, or set K6_TEST_EMAIL + K6_TEST_PASSWORD',
    );
  }
}

const authHeaders = {
  apikey: SUPABASE_ANON_KEY,
  'Content-Type': 'application/json',
};

function randomPauseSeconds() {
  const ms = PAUSE_MIN_MS + Math.random() * (PAUSE_MAX_MS - PAUSE_MIN_MS);
  return ms / 1000;
}

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

function loadUsersFromCsv(raw, csvPathLabel) {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    throw new Error(`CSV at ${csvPathLabel} has no data rows`);
  }

  const header = parseCsvLine(lines[0]).map((x) => x.trim().toLowerCase());
  const usernameIdx = header.indexOf('username');
  const passwordIdx = header.indexOf('password');
  const envIdx = header.indexOf('environment');

  if (usernameIdx < 0 || passwordIdx < 0) {
    throw new Error(`CSV at ${csvPathLabel} must include username,password columns`);
  }

  const users = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const email = (cols[usernameIdx] ?? '').trim();
    const password = (cols[passwordIdx] ?? '').trim();
    const env = envIdx >= 0 ? (cols[envIdx] ?? '').trim().toLowerCase() : '';

    if (!email || !password) continue;
    if (USERS_CSV_ENV_FILTER && env && env !== USERS_CSV_ENV_FILTER) continue;
    users.push({ email, password });
  }

  if (users.length === 0) {
    throw new Error(
      `No usable users in ${csvPathLabel}${USERS_CSV_ENV_FILTER ? ` for environment=${USERS_CSV_ENV_FILTER}` : ''}`,
    );
  }
  return users;
}

const CSV_USERS = USERS_CSV_PATH ? loadUsersFromCsv(open(USERS_CSV_PATH), USERS_CSV_PATH) : null;

function login(email, password) {
  const res = http.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    JSON.stringify({
      email,
      password,
    }),
    { headers: authHeaders, tags: { endpoint: 'auth_login' } },
  );

  const ok = check(res, {
    'login status is 200': (r) => r.status === 200,
    'login has access_token': (r) => Boolean(r.json('access_token')),
  });

  if (!ok) {
    throw new Error(`Login failed with status ${res.status}: ${res.body}`);
  }

  return res.json('access_token');
}

export const options = {
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<600', 'p(99)<1000'],
    'http_req_duration{endpoint:rpc_badges}': ['p(95)<450', 'p(99)<800'],
    'http_req_duration{endpoint:rpc_layout}': ['p(95)<700', 'p(99)<1200'],
  },
  scenarios: {
    shell_rpc_load: {
      executor: 'ramping-vus',
      stages: [
        { duration: '1m', target: 20 },
        { duration: '3m', target: 50 },
        { duration: '1m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
};

export function setup() {
  if (SHARED_TOKEN) {
    return { users: [{ email: 'shared-token-user', password: '', token: SHARED_TOKEN }] };
  }

  const users = CSV_USERS
    ? CSV_USERS.map((u) => ({ ...u }))
    : [{ email: TEST_EMAIL, password: TEST_PASSWORD }];

  const preauthTarget = PREAUTH_COUNT > 0 ? Math.min(PREAUTH_COUNT, users.length) : users.length;
  for (let i = 0; i < preauthTarget; i += 1) {
    users[i].token = login(users[i].email, users[i].password);
    if (PREAUTH_DELAY_MS > 0 && i + 1 < preauthTarget) {
      sleep(PREAUTH_DELAY_MS / 1000);
    }
  }

  return { users };
}

function callRpc(token, rpcName, endpointTag) {
  const res = http.post(
    `${SUPABASE_URL}/rest/v1/rpc/${rpcName}`,
    '{}',
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      tags: { endpoint: endpointTag },
    },
  );

  check(res, {
    [`${rpcName} status is 200`]: (r) => r.status === 200,
  });
}

const tokenCache = new Map();

function getVuUser(users) {
  const idx = (__VU - 1) % users.length;
  return users[idx];
}

function getTokenForVu(users) {
  if (SHARED_TOKEN) return SHARED_TOKEN;
  const vuUser = getVuUser(users);
  if (vuUser.token) return vuUser.token;
  const cached = tokenCache.get(vuUser.email);
  if (cached) return cached;
  const token = login(vuUser.email, vuUser.password);
  tokenCache.set(vuUser.email, token);
  return token;
}

export default function (data) {
  const token = getTokenForVu(data.users);
  const pick = Math.random();
  if (pick <= BADGE_RPC_WEIGHT) {
    callRpc(token, 'main_shell_badge_counts_bundle', 'rpc_badges');
  } else {
    callRpc(token, 'main_shell_layout_bundle', 'rpc_layout');
  }
  sleep(randomPauseSeconds());
}
