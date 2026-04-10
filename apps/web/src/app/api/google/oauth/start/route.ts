import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

const SCOPES: Record<string, string> = {
  sheets: 'https://www.googleapis.com/auth/spreadsheets.readonly',
  calendar: 'https://www.googleapis.com/auth/calendar.events',
};

/** Starts Google OAuth (Sheets or Calendar). Requires GOOGLE_CLIENT_ID and callback URL. */
export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    return NextResponse.json(
      { error: 'Google OAuth is not configured (missing GOOGLE_CLIENT_ID).' },
      { status: 501 }
    );
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  if (type !== 'sheets' && type !== 'calendar') {
    return NextResponse.json({ error: 'type must be sheets or calendar' }, { status: 400 });
  }

  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/api/google/oauth/callback`;

  const state = crypto.randomUUID();
  const jar = await cookies();
  jar.set('google_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  jar.set(
    'google_oauth_meta',
    Buffer.from(JSON.stringify({ type, uid: user.id })).toString('base64url'),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
    }
  );

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPES[type]);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);
  url.searchParams.set('include_granted_scopes', 'true');

  return NextResponse.redirect(url.toString());
}
