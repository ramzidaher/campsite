import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { buildGoogleOAuthRedirectUri, createGoogleOAuthState } from '@/lib/google/googleOAuth';

const SCOPES: Record<string, string> = {
  sheets: 'https://www.googleapis.com/auth/spreadsheets.readonly',
  calendar: 'https://www.googleapis.com/auth/calendar.events',
};

/** Starts Google OAuth (Sheets or Calendar). Requires GOOGLE_CLIENT_ID and callback URL. */
export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'Google OAuth is not configured (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).' },
      { status: 501 }
    );
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  if (type !== 'sheets' && type !== 'calendar') {
    return NextResponse.json({ error: 'type must be sheets or calendar' }, { status: 400 });
  }

  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const redirectUri = buildGoogleOAuthRedirectUri(req);
  const state = createGoogleOAuthState({
    uid: user.id,
    type,
    returnTo: new URL('/settings', req.url).toString(),
  });

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
