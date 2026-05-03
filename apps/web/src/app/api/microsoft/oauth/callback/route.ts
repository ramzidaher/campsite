import { createServiceRoleClient } from '@/lib/supabase/service-role';
import {
  appendMicrosoftOAuthReturnParam,
  buildMicrosoftOAuthRedirectUri,
  parseMicrosoftOAuthState,
} from '@/lib/microsoft/microsoftOAuth';
import { buildOAuthAppBaseUrl } from '@/lib/oauth/oauthAppBaseUrl';
import { invalidateSettingsPageDataForUser } from '@/lib/settings/getCachedSettingsPageData';
import { NextResponse } from 'next/server';

/** Handles the Microsoft OAuth callback. Stores tokens in microsoft_connections. */
export async function GET(req: Request) {
  const clientId = (process.env.MICROSOFT_CLIENT_ID ?? process.env.CLIENT_ID)?.trim();
  const clientSecret = (process.env.MICROSOFT_CLIENT_SECRET ?? process.env.CLIENT_SECRET)?.trim();
  const tenantId = (process.env.MICROSOFT_TENANT_ID ?? process.env.TENANT_ID)?.trim();

  const { searchParams } = new URL(req.url);
  const stateRaw = searchParams.get('state');
  const oauthState = parseMicrosoftOAuthState(stateRaw);
  const fallbackReturnTo = new URL('/settings', buildOAuthAppBaseUrl(req)).toString();
  const returnTo = oauthState?.returnTo ?? fallbackReturnTo;

  if (!clientId || !clientSecret || !tenantId) {
    return NextResponse.redirect(
      appendMicrosoftOAuthReturnParam(returnTo, 'outlook_error', 'not_configured')
    );
  }

  const err = searchParams.get('error');
  if (err) {
    const desc = searchParams.get('error_description') ?? err;
    return NextResponse.redirect(
      appendMicrosoftOAuthReturnParam(returnTo, 'outlook_error', desc.slice(0, 100))
    );
  }

  const code = searchParams.get('code');
  if (!code || !oauthState) {
    return NextResponse.redirect(
      appendMicrosoftOAuthReturnParam(returnTo, 'outlook_error', 'invalid_state')
    );
  }

  const redirectUri = buildMicrosoftOAuthRedirectUri(req);

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
      appendMicrosoftOAuthReturnParam(returnTo, 'outlook_error', `token_${t.slice(0, 80)}`)
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
      appendMicrosoftOAuthReturnParam(returnTo, 'outlook_error', tokens.error ?? 'no_access_token')
    );
  }
  if (!tokens.refresh_token) {
    return NextResponse.redirect(
      appendMicrosoftOAuthReturnParam(returnTo, 'outlook_error', 'no_refresh_token_re_consent')
    );
  }

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

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch {
    return NextResponse.redirect(
      appendMicrosoftOAuthReturnParam(returnTo, 'outlook_error', 'service_role_missing')
    );
  }

  const { error } = await admin.from('microsoft_connections').upsert(
    {
      user_id: oauthState.uid,
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
      appendMicrosoftOAuthReturnParam(returnTo, 'outlook_error', error.message)
    );
  }

  await invalidateSettingsPageDataForUser(oauthState.uid).catch(() => null);

  return NextResponse.redirect(appendMicrosoftOAuthReturnParam(returnTo, 'outlook_connected', '1'));
}
