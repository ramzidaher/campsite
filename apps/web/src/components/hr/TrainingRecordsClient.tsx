'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type TrainingStatus = 'planned' | 'in_progress' | 'completed' | 'expired';

type TrainingRow = {
  id: string;
  title: string;
  provider: string | null;
  status: TrainingStatus;
  started_on: string | null;
  completed_on: string | null;
  expires_on: string | null;
  notes: string | null;
  certificate_document_url: string | null;
  created_at: string;
};

export function TrainingRecordsClient({
  subjectUserId,
  initialRows,
  canEdit,
}: {
  subjectUserId: string;
  initialRows: TrainingRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<TrainingRow[]>(initialRows);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [form, setForm] = useState({
    title: '',
    provider: '',
    status: 'planned' as TrainingStatus,
    started_on: '',
    completed_on: '',
    expires_on: '',
    notes: '',
    certificate_document_url: '',
  });

  const sortedRows = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const aDate = a.completed_on || a.started_on || a.created_at;
        const bDate = b.completed_on || b.started_on || b.created_at;
        return String(bDate).localeCompare(String(aDate));
      }),
    [rows]
  );

  async function refresh() {
    const res = await fetch(`/api/hr/training-records?userId=${encodeURIComponent(subjectUserId)}`, {
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => ({}))) as { rows?: TrainingRow[]; error?: string };
    if (!res.ok) {
      setMsg({ type: 'err', text: data.error ?? 'Failed to refresh training records.' });
      return;
    }
    setRows(data.rows ?? []);
  }

  async function createRecord() {
    if (!canEdit || !form.title.trim()) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/hr/training-records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: subjectUserId,
        title: form.title.trim(),
        provider: form.provider.trim() || null,
        status: form.status,
        started_on: form.started_on || null,
        completed_on: form.completed_on || null,
        expires_on: form.expires_on || null,
        notes: form.notes.trim() || null,
        certificate_document_url: form.certificate_document_url.trim() || null,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setMsg({ type: 'err', text: data.error ?? 'Could not save training record.' });
      return;
    }
    setForm({
      title: '',
      provider: '',
      status: 'planned',
      started_on: '',
      completed_on: '',
      expires_on: '',
      notes: '',
      certificate_document_url: '',
    });
    await refresh();
    router.refresh();
    setMsg({ type: 'ok', text: 'Training record added.' });
  }

  async function deleteRecord(id: string) {
    if (!canEdit) return;
    if (!window.confirm('Remove this training record?')) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/hr/training-records/${id}`, { method: 'DELETE' });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setMsg({ type: 'err', text: data.error ?? 'Could not remove training record.' });
      return;
    }
    await refresh();
    router.refresh();
    setMsg({ type: 'ok', text: 'Training record removed.' });
  }

  return (
    <section className="mt-6 rounded-xl border border-[var(--color-border-tertiary)] bg-[var(--color-background-primary)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--color-text-primary)]">Training records</h2>
          <p className="mt-1 text-[12px] text-[var(--color-text-secondary)]">
            Track learning, certifications, expiry dates, and completion status.
          </p>
        </div>
      </div>

      {msg ? (
        <p
          className={[
            'mt-3 rounded-lg px-3 py-2 text-[13px]',
            msg.type === 'err'
              ? 'border border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]'
              : 'border border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]',
          ].join(' ')}
        >
          {msg.text}
        </p>
      ) : null}

      {canEdit ? (
        <div className="mt-4 grid gap-3 rounded-lg border border-[var(--color-border-tertiary)] bg-[var(--color-background-secondary)] p-3 sm:grid-cols-2">
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Training title"
            className="rounded-lg border border-[var(--color-border-tertiary)] bg-[var(--color-background-primary)] px-3 py-2 text-[13px]"
          />
          <input
            value={form.provider}
            onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
            placeholder="Provider"
            className="rounded-lg border border-[var(--color-border-tertiary)] bg-[var(--color-background-primary)] px-3 py-2 text-[13px]"
          />
          <select
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as TrainingStatus }))}
            className="rounded-lg border border-[var(--color-border-tertiary)] bg-[var(--color-background-primary)] px-3 py-2 text-[13px]"
          >
            <option value="planned">Planned</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="expired">Expired</option>
          </select>
          <input
            type="date"
            value={form.started_on}
            onChange={(e) => setForm((f) => ({ ...f, started_on: e.target.value }))}
            className="rounded-lg border border-[var(--color-border-tertiary)] bg-[var(--color-background-primary)] px-3 py-2 text-[13px]"
          />
          <input
            type="date"
            value={form.completed_on}
            onChange={(e) => setForm((f) => ({ ...f, completed_on: e.target.value }))}
            className="rounded-lg border border-[var(--color-border-tertiary)] bg-[var(--color-background-primary)] px-3 py-2 text-[13px]"
          />
          <input
            type="date"
            value={form.expires_on}
            onChange={(e) => setForm((f) => ({ ...f, expires_on: e.target.value }))}
            className="rounded-lg border border-[var(--color-border-tertiary)] bg-[var(--color-background-primary)] px-3 py-2 text-[13px]"
          />
          <input
            value={form.certificate_document_url}
            onChange={(e) => setForm((f) => ({ ...f, certificate_document_url: e.target.value }))}
            placeholder="Certificate URL (optional)"
            className="sm:col-span-2 rounded-lg border border-[var(--color-border-tertiary)] bg-[var(--color-background-primary)] px-3 py-2 text-[13px]"
          />
          <textarea
            rows={2}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Notes"
            className="sm:col-span-2 rounded-lg border border-[var(--color-border-tertiary)] bg-[var(--color-background-primary)] px-3 py-2 text-[13px]"
          />
          <div className="sm:col-span-2">
            <button
              type="button"
              disabled={busy || !form.title.trim()}
              onClick={() => void createRecord()}
              className="rounded-lg bg-[var(--org-brand-primary,#0f6e56)] px-4 py-2 text-[12.5px] font-medium text-white disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Add training record'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        {sortedRows.length === 0 ? (
          <p className="text-[12px] text-[var(--color-text-secondary)]">No training records yet.</p>
        ) : (
          sortedRows.map((row) => (
            <div
              key={row.id}
              className="rounded-lg border border-[var(--color-border-tertiary)] bg-[var(--color-background-primary)] px-3 py-3 text-[12.5px]"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-[var(--color-text-primary)]">{row.title}</p>
                  <p className="text-[var(--color-text-secondary)]">
                    {row.provider || 'No provider'} · {row.status.replace('_', ' ')}
                  </p>
                  <p className="text-[var(--color-text-tertiary)]">
                    {row.started_on ? `Started ${row.started_on}` : 'Start date not set'}
                    {row.completed_on ? ` · Completed ${row.completed_on}` : ''}
                    {row.expires_on ? ` · Expires ${row.expires_on}` : ''}
                  </p>
                  {row.notes ? <p className="mt-1 text-[var(--color-text-secondary)]">{row.notes}</p> : null}
                  {row.certificate_document_url ? (
                    <a
                      href={row.certificate_document_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-[12px] text-[var(--org-brand-primary,#0f6e56)] underline underline-offset-2"
                    >
                      View certificate
                    </a>
                  ) : null}
                </div>
                {canEdit ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void deleteRecord(row.id)}
                    className="rounded border border-[var(--color-border-tertiary)] px-2.5 py-1 text-[12px] text-[var(--color-text-primary)] hover:bg-[var(--color-background-secondary)]"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
