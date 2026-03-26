'use client';

import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useMemo, useState } from 'react';

/** Super Admin / Senior Manager — Google Sheets rota import wizard (steps 2–4 call APIs when wired). */
export function SheetsImportWizard({ orgId }: { orgId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [step, setStep] = useState(1);
  const [sheetUrl, setSheetUrl] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  async function validateSheetUrl() {
    setMsg(null);
    if (!sheetUrl.trim()) {
      setMsg('Paste a Google Sheets URL.');
      return;
    }
    setMsg('Validation will call the Sheets API once the import worker is deployed.');
    setStep(3);
  }

  async function saveMapping() {
    setMsg('Column mapping is saved via `sheets_mappings` when the import API is enabled.');
    setStep(4);
  }

  async function runImport() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    setMsg(null);
    const finishedAt = new Date().toISOString();
    const { error } = await supabase.from('rota_sheets_sync_log').insert({
      org_id: orgId,
      triggered_by: u.user.id,
      source: 'manual',
      rows_imported: 0,
      finished_at: finishedAt,
    });
    if (error) {
      setMsg(error.message);
      return;
    }
    setMsg(
      'Manual sync recorded (0 rows until the Sheets importer is deployed). Refresh the page to see history.'
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Link href="/admin" className="text-sm text-emerald-400 hover:underline">
        ← Admin
      </Link>
      <div>
        <h1 className="text-xl font-semibold text-[var(--campsite-text)]">Rota import (Google Sheets)</h1>
        <p className="mt-1 text-sm text-[var(--campsite-text-secondary)]">
          Org: <span className="font-mono text-xs">{orgId}</span>
        </p>
      </div>

      <ol className="list-inside list-decimal space-y-4 text-sm text-[var(--campsite-text)]">
        <li className={step >= 1 ? 'opacity-100' : 'opacity-40'}>
          <strong>Connect Google</strong>
          <p className="mt-1 text-[var(--campsite-text-secondary)]">
            Use Settings → Integrations → Connect Google Sheets, then return here.
          </p>
          <a
            href="/api/google/oauth/start?type=sheets"
            className="mt-2 inline-block rounded-md border border-[var(--campsite-border)] px-3 py-1.5 text-sm"
          >
            Open Google OAuth
          </a>
          <button
            type="button"
            className="ml-2 rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white"
            onClick={() => setStep(2)}
          >
            Next
          </button>
        </li>

        <li className={step >= 2 ? 'opacity-100' : 'opacity-40'}>
          <strong>Sheets URL</strong>
          <input
            className="mt-2 w-full rounded-md border border-[var(--campsite-border)] bg-[var(--campsite-surface)] px-3 py-2 text-sm"
            placeholder="https://docs.google.com/spreadsheets/d/…"
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
          />
          <button
            type="button"
            className="mt-2 rounded-md border border-[var(--campsite-border)] px-3 py-1.5 text-sm"
            onClick={() => void validateSheetUrl()}
          >
            Validate &amp; list tabs
          </button>
        </li>

        <li className={step >= 3 ? 'opacity-100' : 'opacity-40'}>
          <strong>Column mapping</strong>
          <p className="mt-1 text-[var(--campsite-text-secondary)]">
            Preview first rows and map Name, Date, Start, End, Department, Role — stored in{' '}
            <code className="text-xs">sheets_mappings</code>.
          </p>
          <button
            type="button"
            className="mt-2 rounded-md border border-[var(--campsite-border)] px-3 py-1.5 text-sm"
            onClick={() => void saveMapping()}
          >
            Save mapping
          </button>
        </li>

        <li className={step >= 4 ? 'opacity-100' : 'opacity-40'}>
          <strong>Run import</strong>
          <p className="mt-1 text-[var(--campsite-text-secondary)]">
            Sync schedule: manual / 6h / 24h — configure on the Google connection row. “Sync now” will
            call the same importer.
          </p>
          <button
            type="button"
            className="mt-2 rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white"
            onClick={() => void runImport()}
          >
            Import now
          </button>
        </li>
      </ol>

      {msg ? <p className="text-sm text-[var(--campsite-text-secondary)]">{msg}</p> : null}
    </div>
  );
}
