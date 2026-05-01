'use client';

import { createClient } from '@/lib/supabase/client';
import { extractSpreadsheetId } from '@/lib/rota/sheetsImportParse';
import { useCallback, useEffect, useMemo, useState } from 'react';

/** Org admin - Google Sheets rota import wizard; links `google_connections`, `sheets_mappings`, then POST import. */
export function SheetsImportWizard({ orgId }: { orgId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [step, setStep] = useState(1);
  const [sheetUrl, setSheetUrl] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rotas, setRotas] = useState<{ id: string; title: string }[]>([]);
  const [mappingId, setMappingId] = useState<string | null>(null);
  const [targetRotaId, setTargetRotaId] = useState('');
  const [sheetsConnId, setSheetsConnId] = useState<string | null>(null);
  const [colName, setColName] = useState('A');
  const [colDate, setColDate] = useState('B');
  const [colStart, setColStart] = useState('C');
  const [colEnd, setColEnd] = useState('D');
  const [colDept, setColDept] = useState('');
  const [colRole, setColRole] = useState('');
  const [sheetTabName, setSheetTabName] = useState('Sheet1');
  const [headerRow, setHeaderRow] = useState('1');

  const loadState = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: rotaRows }, { data: mapRow }, { data: connRow }] = await Promise.all([
      supabase.from('rotas').select('id,title').eq('org_id', orgId).order('title'),
      supabase
        .from('sheets_mappings')
        .select(
          'id,target_rota_id,connection_id,col_name,col_date,col_start,col_end,col_dept,col_role,sheet_name,header_row',
        )
        .eq('org_id', orgId)
        .limit(1)
        .maybeSingle(),
      supabase.from('google_connections').select('id,spreadsheet_id,sheets_url').eq('user_id', user.id).eq('type', 'sheets').maybeSingle(),
    ]);

    setRotas((rotaRows ?? []) as { id: string; title: string }[]);
    if (connRow) {
      setSheetsConnId(connRow.id as string);
      if (connRow.sheets_url) setSheetUrl((connRow.sheets_url as string) ?? '');
    } else {
      setSheetsConnId(null);
    }

    if (mapRow) {
      setMappingId(mapRow.id as string);
      setTargetRotaId((mapRow.target_rota_id as string | null) ?? '');
      setColName((mapRow.col_name as string | null) || 'A');
      setColDate((mapRow.col_date as string | null) || 'B');
      setColStart((mapRow.col_start as string | null) || 'C');
      setColEnd((mapRow.col_end as string | null) || 'D');
      setColDept((mapRow.col_dept as string | null) || '');
      setColRole((mapRow.col_role as string | null) || '');
      setSheetTabName((mapRow.sheet_name as string | null) || 'Sheet1');
      setHeaderRow(String(mapRow.header_row ?? 1));
    } else {
      setMappingId(null);
      setTargetRotaId('');
      setColName('A');
      setColDate('B');
      setColStart('C');
      setColEnd('D');
      setColDept('');
      setColRole('');
      setSheetTabName('Sheet1');
      setHeaderRow('1');
    }
  }, [supabase, orgId]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  async function validateSheetUrl() {
    setMsg(null);
    if (!sheetUrl.trim()) {
      setMsg('Paste a Google Sheets URL.');
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setMsg('Sign in required.');
      return;
    }
    if (!sheetsConnId) {
      setMsg('Connect Google Sheets first (step 1), then try again.');
      return;
    }
    const sid = extractSpreadsheetId(sheetUrl);
    if (!sid) {
      setMsg('Could not read spreadsheet ID from that URL.');
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from('google_connections')
      .update({
        spreadsheet_id: sid,
        sheets_url: sheetUrl.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', sheetsConnId)
      .eq('user_id', user.id);
    setBusy(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setMsg('Spreadsheet linked to your Google connection. Set column letters and tab name in the next step.');
    setStep(3);
  }

  async function saveMapping() {
    setMsg(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setMsg('Sign in required.');
      return;
    }
    if (!sheetsConnId) {
      setMsg('Connect Google Sheets first, then save mapping.');
      return;
    }
    const hr = Math.max(1, parseInt(headerRow, 10) || 1);
    const payload = {
      org_id: orgId,
      connection_id: sheetsConnId,
      target_rota_id: targetRotaId || null,
      col_name: colName.trim() || 'A',
      col_date: colDate.trim() || 'B',
      col_start: colStart.trim() || 'C',
      col_end: colEnd.trim() || 'D',
      col_dept: colDept.trim() || null,
      col_role: colRole.trim() || null,
      sheet_name: sheetTabName.trim() || 'Sheet1',
      header_row: hr,
    };
    setBusy(true);
    if (mappingId) {
      const { error } = await supabase.from('sheets_mappings').update(payload).eq('id', mappingId);
      setBusy(false);
      if (error) {
        setMsg(error.message);
        return;
      }
    } else {
      const { data, error } = await supabase.from('sheets_mappings').insert(payload).select('id').single();
      setBusy(false);
      if (error) {
        setMsg(error.message);
        return;
      }
      setMappingId((data as { id: string }).id);
    }
    setMsg('Mapping saved. Run import to pull rows into rota shifts (same org timezone applies to date/time cells).');
    setStep(4);
  }

  async function runImport() {
    setMsg(null);
    setBusy(true);
    try {
      const r = await fetch('/api/admin/rota-sheets-import', {
        method: 'POST',
        credentials: 'same-origin',
      });
      const j = (await r.json()) as { ok?: boolean; message?: string; error?: string; imported?: number; skipped?: number; warnings?: number };
      if (!r.ok) {
        setMsg(j.error ?? `Import failed (${r.status})`);
        return;
      }
      setMsg(j.message ?? `Imported ${j.imported ?? 0} row(s).`);
      await loadState();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Import request failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 px-5 py-7 sm:px-[28px]">
      <div>
        <h1 className="font-authSerif text-[22px] tracking-tight text-[#121212]">
          Rota import (Google Sheets)
        </h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          Org: <span className="font-mono text-xs text-[#121212]">{orgId}</span>
        </p>
      </div>

      <ol className="list-inside list-decimal space-y-4 text-[13px] text-[#121212]">
        <li className={step >= 1 ? 'opacity-100' : 'opacity-40'}>
          <strong>Connect Google</strong>
          <p className="mt-1 text-[#6b6b6b]">
            Use Settings → Integrations → Connect Google Sheets, then return here.
          </p>
          {!sheetsConnId ? (
            <p className="mt-1 text-[12px] text-amber-800">No Sheets connection on this account yet.</p>
          ) : (
            <p className="mt-1 text-[12px] text-[#6b6b6b]">Sheets OAuth linked.</p>
          )}
          <a
            href="/api/google/oauth/start?type=sheets"
            className="mt-2 inline-block rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] font-medium text-[#121212] hover:bg-[#f5f4f1]"
          >
            Open Google OAuth
          </a>
          <button
            type="button"
            disabled={busy}
            className="ml-2 rounded-lg bg-[#121212] px-3 py-2 text-[13px] font-medium text-[#faf9f6] hover:opacity-90 disabled:opacity-50"
            onClick={() => setStep(2)}
          >
            Next
          </button>
        </li>

        <li className={step >= 2 ? 'opacity-100' : 'opacity-40'}>
          <strong>Sheets URL</strong>
          <input
            className="mt-2 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px] text-[#121212] outline-none focus:ring-1 focus:ring-[#121212]"
            placeholder="https://docs.google.com/spreadsheets/d/..."
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
          />
          <button
            type="button"
            disabled={busy}
            className="mt-2 rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] font-medium text-[#121212] hover:bg-[#f5f4f1] disabled:opacity-50"
            onClick={() => void validateSheetUrl()}
          >
            Validate &amp; continue
          </button>
        </li>

        <li className={step >= 3 ? 'opacity-100' : 'opacity-40'}>
          <strong>Column mapping &amp; target rota</strong>
          <p className="mt-1 text-[#6b6b6b]">
            Column letters (row below header is first data row). Dates use the organisation timezone when converting to
            UTC. Names must match an active member&apos;s full name or email (or use &quot;open&quot; for unassigned).
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-[12px] text-[#6b6b6b]">
              Name col
              <input
                className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-2 py-1.5 font-mono text-[13px]"
                value={colName}
                onChange={(e) => setColName(e.target.value)}
              />
            </label>
            <label className="text-[12px] text-[#6b6b6b]">
              Date col
              <input
                className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-2 py-1.5 font-mono text-[13px]"
                value={colDate}
                onChange={(e) => setColDate(e.target.value)}
              />
            </label>
            <label className="text-[12px] text-[#6b6b6b]">
              Start time col
              <input
                className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-2 py-1.5 font-mono text-[13px]"
                value={colStart}
                onChange={(e) => setColStart(e.target.value)}
              />
            </label>
            <label className="text-[12px] text-[#6b6b6b]">
              End time col
              <input
                className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-2 py-1.5 font-mono text-[13px]"
                value={colEnd}
                onChange={(e) => setColEnd(e.target.value)}
              />
            </label>
            <label className="text-[12px] text-[#6b6b6b]">
              Dept col (optional)
              <input
                className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-2 py-1.5 font-mono text-[13px]"
                value={colDept}
                onChange={(e) => setColDept(e.target.value)}
                placeholder="-"
              />
            </label>
            <label className="text-[12px] text-[#6b6b6b]">
              Role col (optional)
              <input
                className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-2 py-1.5 font-mono text-[13px]"
                value={colRole}
                onChange={(e) => setColRole(e.target.value)}
                placeholder="-"
              />
            </label>
          </div>
          <label className="mt-2 block text-[12px] text-[#6b6b6b]">
            Sheet tab name
            <input
              className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] text-[#121212]"
              value={sheetTabName}
              onChange={(e) => setSheetTabName(e.target.value)}
            />
          </label>
          <label className="mt-2 block text-[12px] text-[#6b6b6b]">
            Header row (1-based)
            <input
              className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] text-[#121212]"
              value={headerRow}
              onChange={(e) => setHeaderRow(e.target.value)}
            />
          </label>
          <label className="mt-2 block text-[12px] text-[#6b6b6b]">
            Target rota (optional)
            <select
              className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] text-[#121212]"
              value={targetRotaId}
              onChange={(e) => setTargetRotaId(e.target.value)}
            >
              <option value="">None (legacy / unscoped rows)</option>
              {rotas.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy}
            className="mt-2 rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] font-medium text-[#121212] hover:bg-[#f5f4f1] disabled:opacity-50"
            onClick={() => void saveMapping()}
          >
            Save mapping
          </button>
        </li>

        <li className={step >= 4 ? 'opacity-100' : 'opacity-40'}>
          <strong>Run import</strong>
          <p className="mt-1 text-[#6b6b6b]">
            Pulls the configured range from your sheet and upserts <code className="text-xs">rota_shifts</code> by
            stable row key. Sync interval on the Google connection applies to future automation.
          </p>
          <button
            type="button"
            disabled={busy}
            className="mt-2 rounded-lg bg-[#121212] px-3 py-2 text-[13px] font-medium text-[#faf9f6] hover:opacity-90 disabled:opacity-50"
            onClick={() => void runImport()}
          >
            {busy ? 'Working...' : 'Import now'}
          </button>
        </li>
      </ol>

      {msg ? <p className="text-[13px] text-[#6b6b6b]">{msg}</p> : null}
    </div>
  );
}
