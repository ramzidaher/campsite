import { NextResponse } from 'next/server';

import { Redis } from '@upstash/redis';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { shellBundleOrgId } from '@/lib/shell/shellBundleAccess';

export const dynamic = 'force-dynamic';

export async function GET() {
  const bundle = await getCachedMainShellLayoutBundle();
  if (!shellBundleOrgId(bundle)) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return NextResponse.json({
      ok: false,
      error: 'UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN env vars are not set',
    });
  }

  const redis = Redis.fromEnv();
  const testKey = `campsite:redis-check:${Date.now()}`;
  const testValue = { ts: Date.now(), check: 'ok' };
  const results: Record<string, unknown> = {};

  // Ping
  const pingStart = Date.now();
  try {
    const pong = await redis.ping();
    results.ping = { ok: true, response: pong, ms: Date.now() - pingStart };
  } catch (err) {
    results.ping = { ok: false, error: String(err), ms: Date.now() - pingStart };
    return NextResponse.json({ ok: false, results });
  }

  // Write
  const writeStart = Date.now();
  try {
    await redis.set(testKey, testValue, { ex: 30 });
    results.write = { ok: true, ms: Date.now() - writeStart };
  } catch (err) {
    results.write = { ok: false, error: String(err), ms: Date.now() - writeStart };
    return NextResponse.json({ ok: false, results });
  }

  // Read back
  const readStart = Date.now();
  try {
    const readBack = await redis.get(testKey);
    const matched = JSON.stringify(readBack) === JSON.stringify(testValue);
    results.read = { ok: matched, value: readBack, ms: Date.now() - readStart };
  } catch (err) {
    results.read = { ok: false, error: String(err), ms: Date.now() - readStart };
    return NextResponse.json({ ok: false, results });
  }

  // Cleanup
  await redis.del(testKey).catch(() => null);

  return NextResponse.json({ ok: true, results });
}
