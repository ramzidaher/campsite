import { getAuthUser } from '@/lib/supabase/getAuthUser';
import {
  buildMicrosoftOAuthRedirectUri,
  createMicrosoftOAuthState,
} from '@/lib/microsoft/microsoftOAuth';
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

  let state: string;
  try {
    state = createMicrosoftOAuthState({
      uid: user.id,
      returnTo: new URL('/settings', req.url).toString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'state_error';
    return NextResponse.json({ error: msg }, { status: 501 });
  }

  const redirectUri = buildMicrosoftOAuthRedirectUri(req);

  // Use 'common' so users from any Azure AD tenant can sign in (multi-tenant app).
  const url = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_mode', 'query');
  url.searchParams.set('scope', 'Calendars.ReadWrite offline_access');
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'consent');

  return NextResponse.redirect(url.toString());
}
