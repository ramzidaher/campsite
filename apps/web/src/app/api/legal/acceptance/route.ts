import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function bestEffortClientIp(req: Request): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get('x-real-ip')?.trim();
  if (real) return real;
  const cf = req.headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf;
  return null;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    bundleVersion?: string;
    acceptedAt?: string;
    source?: string;
    flow?: string;
  };
  const bundleVersion = body.bundleVersion?.trim();
  if (!bundleVersion) {
    return NextResponse.json({ error: 'Missing bundleVersion.' }, { status: 400 });
  }

  const source = (body.source?.trim() || 'registration_server_capture').slice(0, 64);
  const acceptedAt = body.acceptedAt?.trim() || new Date().toISOString();
  const requestHost = req.headers.get('host');
  const requestPath = new URL(req.url).pathname;
  const userAgent = req.headers.get('user-agent');
  const requestIp = bestEffortClientIp(req);

  const { error } = await supabase.rpc('record_my_legal_acceptance', {
    p_bundle_version: bundleVersion,
    p_accepted_at: acceptedAt,
    p_acceptance_source: source,
    p_request_host: requestHost,
    p_request_path: requestPath,
    p_user_agent: userAgent,
    p_request_ip: requestIp,
    p_evidence: { flow: body.flow ?? 'unknown', server_captured_ip: Boolean(requestIp) },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
