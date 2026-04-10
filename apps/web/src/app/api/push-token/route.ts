import { parsePushTokenBody } from '@/lib/push/parsePushTokenBody';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

/** Register Expo / web push token (Phase 2 scaffold - wire to Expo push in production). */
export async function POST(req: Request) {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = parsePushTokenBody(raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const { token, platform } = parsed;

  const { error } = await supabase.from('push_tokens').upsert(
    {
      user_id: user.id,
      token,
      platform,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,token' }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
