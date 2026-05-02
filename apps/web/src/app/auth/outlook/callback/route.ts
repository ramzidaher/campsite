import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { createClient } from '@/lib/supabase/server';
import { invalidateSettingsPageDataForUser } from '@/lib/settings/getCachedSettingsPageData';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

/** Handles the Microsoft OAuth callback. Stores tokens in microsoft_connections. */
export async function GET(req: Request) {
  const clientId = (process.env.MICROSOFT_CLIENT_ID ?? process.env.CLIENT_ID)?.trim();
  const clientSecret = (process.env.MICROSOFT_CLIENT_SECRET ?? process.env.CLIENT_SECRET)?.trim();
  const tenantId = (process.env.MICROSOFT_TENANT_ID ?? process.env.TENANT_ID)?.trim();

  if (!clientId || !clientSecret || !tenantId) {
    return NextResponse.redirect(new URL('/settings?outlook_error=not_configured', req.url));
  }

  const { searchParams } = new URL(req.url);
  const err = searchParams.get('error');
  if (err) {
    const desc = searchParams.get('error_description') ?? err;
    return NextResponse.redirect(
      new URL(`/settings?outlook_error=${encodeURIComponent(desc.slice(0, 100))}`, req.url)
    );
  }

  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const jar = await cookies();
  const expected = jar.get('ms_oauth_state')?.value;
  const metaRaw = jar.get('ms_oauth_meta')?.value;
  jar.delete('ms_oauth_state');
  jar.delete('ms_oauth_meta');

  if (!code || !state || !expected || state !== expected || !metaRaw) {
    return NextResponse.redirect(new URL('/settings?outlook_error=invalid_state', req.url));
  }

  let meta: { uid: string };
  try {
    meta = JSON.parse(Buffer.from(metaRaw, 'base64url').toString('utf8')) as { uid: string };
  } catch {
    return NextResponse.redirect(new URL('/settings?outlook_error=bad_meta', req.url));
  }

  const user = await getAuthUser();
  if (!user || user.id !== meta.uid) {
    return NextResponse.redirect(new URL('/settings?outlook_error=session', req.url));
  }

  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/auth/outlook/callback`;

  const tokenRes = await fetch(`https://login.microsoftonline.com/common/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'Calendars.ReadWrite offline_access',
    }),
  });

  if (!tokenRes.ok) {
    const t = await tokenRes.text().catch(() => '');
    return NextResponse.redirect(
      new URL(`/settings?outlook_error=${encodeURIComponent('token_' + t.slice(0, 80))}`, req.url)
    );
  }

  const tokens = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };

  if (!tokens.access_token) {
    return NextResponse.redirect(
      new URL(
        `/settings?outlook_error=${encodeURIComponent(tokens.error ?? 'no_access_token')}`,
        req.url
      )
    );
  }
  if (!tokens.refresh_token) {
    return NextResponse.redirect(
      new URL('/settings?outlook_error=no_refresh_token_re_consent', req.url)
    );
  }

  // Fetch the user's Microsoft email for display.
  let microsoftEmail: string | null = null;
  try {
    const meRes = await fetch(
      'https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName',
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );
    if (meRes.ok) {
      const me = (await meRes.json()) as { mail?: string; userPrincipalName?: string };
      microsoftEmail = me.mail ?? me.userPrincipalName ?? null;
    }
  } catch {
    /* non-fatal */
  }

  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();
  const supabase = await createClient();

  const { error } = await supabase.from('microsoft_connections').upsert(
    {
      user_id: user.id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
      microsoft_email: microsoftEmail,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings?outlook_error=${encodeURIComponent(error.message)}`, req.url)
    );
  }

  await invalidateSettingsPageDataForUser(user.id).catch(() => null);

  return NextResponse.redirect(new URL('/settings?outlook_connected=1', req.url));
}
