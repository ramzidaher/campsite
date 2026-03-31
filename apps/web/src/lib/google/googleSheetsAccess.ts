/** Refresh Google OAuth access token (server-side only; uses client secret). */
export async function refreshGoogleAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).');
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error ?? `Token refresh failed (${res.status})`);
  }
  return { access_token: json.access_token, expires_in: json.expires_in ?? 3600 };
}

/** Fetch raw cell grid from Sheets API v4. */
export async function fetchSpreadsheetValues(
  accessToken: string,
  spreadsheetId: string,
  rangeA1: string,
): Promise<string[][]> {
  const enc = encodeURIComponent(rangeA1);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${enc}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json()) as { values?: string[][]; error?: { message?: string } };
  if (!res.ok) {
    throw new Error(json.error?.message ?? `Sheets API ${res.status}`);
  }
  return json.values ?? [];
}
