import { NextResponse } from 'next/server';

/** Uptime checks: tenant hosts, platform admin, load balancers. No auth. */
export function GET() {
  return NextResponse.json(
    { ok: true, service: 'campsite-web', ts: new Date().toISOString() },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
