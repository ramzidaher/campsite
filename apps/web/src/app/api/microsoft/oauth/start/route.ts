import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { NextResponse } from 'next/server';

/** Initiates Microsoft OAuth (Calendars.ReadWrite). */
export async function GET(req: Request) {
  const clientId = (process.env.MICROSOFT_CLIENT_ID ?? process.env.CLIENT_ID)?.trim();
  const tenantId = (process.env.MICROSOFT_TENANT_ID ?? process.env.TENANT_ID)?.trim();

  if (!clientId || !tenantId) {
    return NextResponse.json(
      { error: 'Microsoft OAuth is not configured (missing CLIENT_ID / TENANT_ID).' },
      { status: 501 }
    );
  }

  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/auth/outlook/callback`;
  const state = crypto.randomUUID();
  const meta = Buffer.from(JSON.stringify({ uid: user.id })).toString('base64url');

  // Use 'common' so users from any Azure AD tenant can sign in (multi-tenant app).
  const url = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_mode', 'query');
  url.searchParams.set('scope', 'Calendars.ReadWrite offline_access');
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'consent');

  // Set cookies on the redirect response directly — jar.set() before NextResponse.redirect()
  // does not attach cookies to the redirect in Next.js Route Handlers.
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 600,
  };
  const response = NextResponse.redirect(url.toString());
  response.cookies.set('ms_oauth_state', state, cookieOpts);
  response.cookies.set('ms_oauth_meta', meta, cookieOpts);
  return response;
}
