import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { encryptGoogleTokenIfConfigured, isGoogleTokenCryptoConfigured } from '@/lib/google/googleTokenCrypto';

/** Exchanges Google OAuth code and stores tokens in `google_connections`. */
export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'Google OAuth is not configured.' },
      { status: 501 }
    );
  }

  const { searchParams } = new URL(req.url);
  const err = searchParams.get('error');
  if (err) {
    return NextResponse.redirect(new URL(`/settings?google_error=${encodeURIComponent(err)}`, req.url));
  }

  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const jar = await cookies();
  const expected = jar.get('google_oauth_state')?.value;
  const metaRaw = jar.get('google_oauth_meta')?.value;
  jar.delete('google_oauth_state');
  jar.delete('google_oauth_meta');

  if (!code || !state || !expected || state !== expected || !metaRaw) {
    return NextResponse.redirect(new URL('/settings?google_error=invalid_state', req.url));
  }

  let meta: { type: 'sheets' | 'calendar'; uid: string };
  try {
    meta = JSON.parse(Buffer.from(metaRaw, 'base64url').toString('utf8')) as {
      type: 'sheets' | 'calendar';
      uid: string;
    };
  } catch {
    return NextResponse.redirect(new URL('/settings?google_error=bad_meta', req.url));
  }

  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/api/google/oauth/callback`;

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
      new URL(`/settings?google_error=${encodeURIComponent('token ' + t.slice(0, 80))}`, req.url)
    );
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  if (!tokens.access_token) {
    return NextResponse.redirect(new URL('/settings?google_error=no_access_token', req.url));
  }

  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user || user.id !== meta.uid) {
    return NextResponse.redirect(new URL('/settings?google_error=session', req.url));
  }

  const refreshToken = tokens.refresh_token;
  if (!refreshToken) {
    return NextResponse.redirect(
      new URL('/settings?google_error=' + encodeURIComponent('no_refresh_token_re_consent'), req.url)
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

  const encryptedAccess = encryptGoogleTokenIfConfigured(tokens.access_token);
  const encryptedRefresh = encryptGoogleTokenIfConfigured(refreshToken);
  const encryptedMode = isGoogleTokenCryptoConfigured();

  const { error } = await supabase.from('google_connections').upsert(
    {
      user_id: user.id,
      type: meta.type,
      access_token: encryptedMode ? null : tokens.access_token,
      refresh_token: encryptedMode ? null : refreshToken,
      access_token_encrypted: encryptedAccess.ciphertext,
      refresh_token_encrypted: encryptedRefresh.ciphertext,
      token_encryption_kid: encryptedAccess.kid ?? encryptedRefresh.kid,
      token_encrypted_at:
        encryptedAccess.ciphertext && encryptedRefresh.ciphertext ? new Date().toISOString() : null,
      expires_at: expiresAt,
      google_email: googleEmail,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,type' }
  );

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings?google_error=${encodeURIComponent(error.message)}`, req.url)
    );
  }

  return NextResponse.redirect(new URL('/settings?google_connected=1', req.url));
}
