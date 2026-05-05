import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { NextResponse } from 'next/server';
import {
  appendGoogleAuthParam,
  buildGoogleOAuthRedirectUri,
  parseGoogleOAuthState,
} from '@/lib/google/googleOAuth';
import {
  encryptGoogleTokenIfConfigured,
  isGoogleTokenCryptoConfigured,
} from '@/lib/google/googleTokenCrypto';
import { invalidateSettingsPageDataForUser } from '@/lib/settings/getCachedSettingsPageData';

/** Exchanges Google OAuth code and stores tokens in `google_connections`. */
export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Google OAuth is not configured.' }, { status: 501 });
  }

  const { searchParams } = new URL(req.url);
  const state = searchParams.get('state');
  const oauthState = parseGoogleOAuthState(state);
  const fallbackReturnTo = new URL('/settings', req.url).toString();
  const returnTo = oauthState?.returnTo ?? fallbackReturnTo;
  const err = searchParams.get('error');
  if (err) {
    return NextResponse.redirect(appendGoogleAuthParam(returnTo, 'google_error', err));
  }

  const code = searchParams.get('code');
  if (!code || !oauthState) {
    return NextResponse.redirect(appendGoogleAuthParam(returnTo, 'google_error', 'invalid_state'));
  }
  const redirectUri = buildGoogleOAuthRedirectUri(req);

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    const t = await tokenRes.text();
    return NextResponse.redirect(
      appendGoogleAuthParam(returnTo, 'google_error', `token ${t.slice(0, 80)}`)
    );
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  if (!tokens.access_token) {
    return NextResponse.redirect(
      appendGoogleAuthParam(returnTo, 'google_error', 'no_access_token')
    );
  }

  const refreshToken = tokens.refresh_token;
  if (!refreshToken) {
    return NextResponse.redirect(
      appendGoogleAuthParam(returnTo, 'google_error', 'no_refresh_token_re_consent')
    );
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  let googleEmail: string | null = null;
  const ui = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (ui.ok) {
    const u = (await ui.json()) as { email?: string };
    googleEmail = u.email ?? null;
  }

  if (!isGoogleTokenCryptoConfigured()) {
    return NextResponse.redirect(
      appendGoogleAuthParam(
        returnTo,
        'google_error',
        'missing_GOOGLE_TOKEN_ENCRYPTION_KEY'
      )
    );
  }

  const encryptedAccess = encryptGoogleTokenIfConfigured(tokens.access_token);
  const encryptedRefresh = encryptGoogleTokenIfConfigured(refreshToken);
  if (!encryptedAccess.ciphertext || !encryptedRefresh.ciphertext) {
    return NextResponse.redirect(
      appendGoogleAuthParam(returnTo, 'google_error', 'google_token_encrypt_failed')
    );
  }

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch {
    return NextResponse.redirect(
      appendGoogleAuthParam(returnTo, 'google_error', 'service_role_missing')
    );
  }

  const { error } = await admin.from('google_connections').upsert(
    {
      user_id: oauthState.uid,
      type: oauthState.type,
      access_token: null,
      refresh_token: null,
      access_token_encrypted: encryptedAccess.ciphertext,
      refresh_token_encrypted: encryptedRefresh.ciphertext,
      token_encryption_kid: encryptedAccess.kid ?? encryptedRefresh.kid,
      token_encrypted_at: new Date().toISOString(),
      expires_at: expiresAt,
      google_email: googleEmail,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,type' }
  );

  if (error) {
    return NextResponse.redirect(appendGoogleAuthParam(returnTo, 'google_error', error.message));
  }

  await invalidateSettingsPageDataForUser(oauthState.uid).catch(() => null);

  return NextResponse.redirect(appendGoogleAuthParam(returnTo, 'google_connected', '1'));
}
