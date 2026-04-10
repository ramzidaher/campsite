import { createClient } from '@/lib/supabase/server';
import { fetchSpreadsheetValues, refreshGoogleAccessToken } from '@/lib/google/googleSheetsAccess';
import {
  cellAt,
  columnLettersToIndex,
  normalizeTimeToHms,
  parseDateCellToYmd,
  quoteSheetNameForRange,
  zonedWallToUtc,
} from '@/lib/rota/sheetsImportParse';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

type MappingRow = {
  id: string;
  org_id: string;
  connection_id: string | null;
  col_name: string | null;
  col_date: string | null;
  col_start: string | null;
  col_end: string | null;
  col_dept: string | null;
  col_role: string | null;
  sheet_name: string | null;
  header_row: number | null;
  target_rota_id: string | null;
};

type ConnRow = {
  id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  spreadsheet_id: string | null;
  sheet_name: string | null;
};

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** POST - org admin only; reads Sheets via caller's `google_connections`, upserts `rota_shifts`. */
export async function POST() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single();

  const orgId = profile?.org_id as string | undefined;
  if (!orgId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { data: allowed } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: orgId,
    p_permission_key: 'rota.manage',
    p_context: {},
  });
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: orgRow } = await supabase.from('organisations').select('timezone').eq('id', orgId).single();
  const orgTz = (orgRow?.timezone as string | null) ?? null;

  const { data: mapping, error: mapErr } = await supabase
    .from('sheets_mappings')
    .select(
      'id, org_id, connection_id, col_name, col_date, col_start, col_end, col_dept, col_role, sheet_name, header_row, target_rota_id',
    )
    .eq('org_id', orgId)
    .limit(1)
    .maybeSingle();

  if (mapErr) {
    return NextResponse.json({ error: mapErr.message }, { status: 500 });
  }
  const m = mapping as MappingRow | null;
  if (!m?.connection_id) {
    return NextResponse.json(
      { error: 'No sheets mapping linked to a Google connection. Save mapping after connecting Google Sheets.' },
      { status: 400 },
    );
  }

  const { data: conn, error: connErr } = await supabase
    .from('google_connections')
    .select('id, access_token, refresh_token, expires_at, spreadsheet_id, sheet_name')
    .eq('id', m.connection_id)
    .eq('user_id', user.id)
    .single();

  if (connErr || !conn) {
    return NextResponse.json(
      { error: 'Google Sheets connection not found for your account. Connect Sheets under Settings or Integrations.' },
      { status: 400 },
    );
  }
  const c = conn as ConnRow;
  const spreadsheetId = c.spreadsheet_id?.trim();
  if (!spreadsheetId) {
    return NextResponse.json(
      { error: 'Spreadsheet ID missing. Paste your sheet URL and validate (step 2) to store it on your Google connection.' },
      { status: 400 },
    );
  }

  const sheetTab = (m.sheet_name?.trim() || c.sheet_name?.trim() || 'Sheet1').trim();
  const headerRow = Math.max(1, m.header_row ?? 1);

  const colName = columnLettersToIndex(m.col_name?.trim() || 'A');
  const colDate = columnLettersToIndex(m.col_date?.trim() || 'B');
  const colStart = columnLettersToIndex(m.col_start?.trim() || 'C');
  const colEnd = columnLettersToIndex(m.col_end?.trim() || 'D');
  const colDept = m.col_dept?.trim() ? columnLettersToIndex(m.col_dept.trim()) : -1;
  const colRole = m.col_role?.trim() ? columnLettersToIndex(m.col_role.trim()) : -1;

  let accessToken = c.access_token;
  const exp = new Date(c.expires_at).getTime();
  if (exp < Date.now() + 60_000) {
    try {
      const t = await refreshGoogleAccessToken(c.refresh_token);
      accessToken = t.access_token;
      const expiresAt = new Date(Date.now() + t.expires_in * 1000).toISOString();
      await supabase
        .from('google_connections')
        .update({
          access_token: accessToken,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', c.id)
        .eq('user_id', user.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Token refresh failed';
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  const quoted = quoteSheetNameForRange(sheetTab);
  const rangeA1 = `${quoted}!A1:ZZ5000`;

  let grid: string[][];
  try {
    grid = await fetchSpreadsheetValues(accessToken, spreadsheetId, rangeA1);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Sheets fetch failed';
    await supabase.from('rota_sheets_sync_log').insert({
      org_id: orgId,
      triggered_by: user.id,
      source: 'manual',
      rows_imported: 0,
      error_message: msg.slice(0, 2000),
      finished_at: new Date().toISOString(),
      target_rota_id: m.target_rota_id,
    });
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  if (m.target_rota_id) {
    const { data: rotaCheck } = await supabase
      .from('rotas')
      .select('id')
      .eq('id', m.target_rota_id)
      .eq('org_id', orgId)
      .maybeSingle();
    if (!rotaCheck) {
      return NextResponse.json({ error: 'Target rota is not in this organisation.' }, { status: 400 });
    }
  }

  const [{ data: profs }, { data: depts }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email').eq('org_id', orgId).eq('status', 'active'),
    supabase.from('departments').select('id, name').eq('org_id', orgId),
  ]);

  const byName = new Map<string, string>();
  for (const p of profs ?? []) {
    const fn = norm((p.full_name as string) ?? '');
    if (fn) byName.set(fn, p.id as string);
    const em = ((p.email as string | null) ?? '').trim().toLowerCase();
    if (em) byName.set(em, p.id as string);
  }

  const byDept = new Map<string, string>();
  for (const d of depts ?? []) {
    byDept.set(norm(d.name as string), d.id as string);
  }

  const dataStartIdx = headerRow;
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  const rowsToUpsert: Record<string, unknown>[] = [];

  for (let i = dataStartIdx; i < grid.length; i++) {
    const sheetRowNum = i + 1;
    const row = grid[i];
    const nameCell = cellAt(row, colName);
    if (!nameCell) {
      skipped++;
      continue;
    }

    const openSlot = /^(open| - |-\s*|n\/a|tbc)$/i.test(nameCell);
    const dateYmd = parseDateCellToYmd(cellAt(row, colDate));
    const startHms = normalizeTimeToHms(cellAt(row, colStart));
    const endHms = normalizeTimeToHms(cellAt(row, colEnd));
    if (!dateYmd || !startHms || !endHms) {
      skipped++;
      errors.push(`Row ${sheetRowNum}: missing date or time`);
      continue;
    }

    let startTime: Date;
    let endTime: Date;
    try {
      startTime = zonedWallToUtc(dateYmd, startHms, orgTz);
      endTime = zonedWallToUtc(dateYmd, endHms, orgTz);
    } catch {
      skipped++;
      errors.push(`Row ${sheetRowNum}: invalid date/time`);
      continue;
    }
    if (endTime <= startTime) {
      skipped++;
      errors.push(`Row ${sheetRowNum}: end must be after start`);
      continue;
    }

    let userId: string | null = null;
    if (!openSlot) {
      const key = norm(nameCell);
      userId = byName.get(key) ?? null;
      if (!userId) {
        const partial = [...byName.entries()].find(([k]) => k.includes(key) || key.includes(k));
        userId = partial?.[1] ?? null;
      }
      if (!userId) {
        skipped++;
        errors.push(`Row ${sheetRowNum}: no profile match for "${nameCell.slice(0, 40)}"`);
        continue;
      }
    }

    let deptId: string | null = null;
    if (colDept >= 0) {
      const dn = cellAt(row, colDept);
      if (dn) {
        deptId = byDept.get(norm(dn)) ?? null;
      }
    }

    const roleLabel = colRole >= 0 ? cellAt(row, colRole) || null : null;
    const keyStable = `${spreadsheetId}:${encodeURIComponent(sheetTab)}:${sheetRowNum}`;

    rowsToUpsert.push({
      org_id: orgId,
      dept_id: deptId,
      user_id: userId,
      role_label: roleLabel,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      notes: null,
      source: 'sheets_import',
      rota_id: m.target_rota_id,
      sheets_import_key: keyStable,
    });
  }

  const chunk = 40;
  for (let j = 0; j < rowsToUpsert.length; j += chunk) {
    const slice = rowsToUpsert.slice(j, j + chunk);
    const { error: upErr } = await supabase.from('rota_shifts').upsert(slice, {
      onConflict: 'org_id,sheets_import_key',
    });
    if (upErr) {
      await supabase.from('rota_sheets_sync_log').insert({
        org_id: orgId,
        triggered_by: user.id,
        source: 'manual',
        rows_imported: imported,
        error_message: upErr.message.slice(0, 2000),
        finished_at: new Date().toISOString(),
        target_rota_id: m.target_rota_id,
      });
      return NextResponse.json({ error: upErr.message, imported }, { status: 500 });
    }
    imported += slice.length;
  }

  await supabase
    .from('google_connections')
    .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', c.id)
    .eq('user_id', user.id);

  const errSummary =
    errors.length > 0
      ? errors.slice(0, 15).join(' | ') + (errors.length > 15 ? ` ... +${errors.length - 15} more` : '')
      : null;

  await supabase.from('rota_sheets_sync_log').insert({
    org_id: orgId,
    triggered_by: user.id,
    source: 'manual',
    rows_imported: imported,
    error_message: errSummary,
    finished_at: new Date().toISOString(),
    target_rota_id: m.target_rota_id,
  });

  return NextResponse.json({
    ok: true,
    imported,
    skipped,
    warnings: errors.length,
    message:
      imported > 0
        ? `Imported ${imported} shift row(s).${skipped ? ` Skipped ${skipped} empty row(s).` : ''}`
        : 'No shifts imported - check column letters, header row, and name/date/time cells.',
  });
}
