import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/** Register Expo / web push token (Phase 2 scaffold — wire to Expo push in production). */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { token?: string; platform?: 'web' | 'ios' | 'android' };
  try {
    body = (await req.json()) as { token?: string; platform?: 'web' | 'ios' | 'android' };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const token = body.token?.trim();
  const platform = body.platform ?? 'web';
  if (!token) {
    return NextResponse.json({ error: 'token required' }, { status: 400 });
  }

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
